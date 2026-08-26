import http from 'node:http';
import crypto from 'node:crypto';

import { loadConfig } from './config.js';
import { ServiceError, asServiceError } from './errors.js';
import { CaiyunBackend } from './backends/caiyun.js';
import { BuiltInAIBackend } from './backends/builtin-ai.js';
import { OpencodeBackend } from './backends/opencode.js';
import { YoudaoWebBackend } from './backends/youdao-web.js';
import { makeChatResponse, modelBackend, normalizeBackend, parseChatRequest, parseTranslateRequest } from './protocol.js';

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function errorPayload(error) {
  const serviceError = asServiceError(error);
  return {
    status: serviceError.status,
    payload: {
      error: {
        message: serviceError.message,
        type: serviceError.code,
        param: null,
        code: serviceError.code,
      },
    },
  };
}

function requestId() {
  return `trans-${crypto.randomUUID()}`;
}

function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let finished = false;
    req.on('data', (chunk) => {
      if (finished) return;
      size += chunk.length;
      if (size > maxBytes) {
        finished = true;
        reject(new ServiceError(`请求体过大（最多 ${maxBytes} 字节）`, { code: 'request_too_large', status: 413 }));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (finished) return;
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new ServiceError('请求体必须是合法 JSON', { code: 'invalid_json', status: 400 }));
      }
    });
    req.on('error', (error) => {
      if (!finished) reject(error);
    });
  });
}

function bearerToken(req) {
  const authorization = req.headers.authorization || '';
  if (/^Bearer\s+/iu.test(authorization)) return authorization.replace(/^Bearer\s+/iu, '').trim();
  return String(req.headers['x-api-key'] || '').trim();
}

function addCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function backendList(config) {
  const configured = config.backends || {};
  const youdao = configured.youdao_web || config.youdao || {};
  const caiyun = configured.caiyun || config.caiyun || {};
  const builtinAI = configured.builtin_ai || config.builtinAI || {};
  const opencode = configured.opencode || config.opencode || {};
  return [
    new YoudaoWebBackend({ ...youdao, timeoutMs: config.timeoutMs, maxTextChars: config.maxTextChars }),
    new CaiyunBackend({ ...caiyun, timeoutMs: config.timeoutMs, maxTextChars: config.maxTextChars }),
    new BuiltInAIBackend({ ...builtinAI, timeoutMs: config.timeoutMs, maxTextChars: config.maxTextChars }),
    new OpencodeBackend({ ...opencode, maxTextChars: config.maxTextChars }),
  ];
}

function backendModel(backend) {
  return backend.model();
}

function statusPayload(backends) {
  const statuses = Object.fromEntries(backends.map((backend) => [backend.id(), { model: backendModel(backend), ...backend.status() }]));
  return statuses;
}

function resolveBackend(backends, requested, configuredBuiltinModel) {
  const id = normalizeBackend(requested, '');
  if (id) {
    const backend = backends.find((candidate) => candidate.id() === id);
    if (backend) return backend;
  }
  if (requested && modelBackend(requested, configuredBuiltinModel) === 'builtin_ai') {
    return backends.find((candidate) => candidate.id() === 'builtin_ai');
  }
  throw new ServiceError(`未知翻译后端或模型: ${requested || '(empty)'}`, {
    code: 'unknown_backend',
    status: 400,
  });
}

function dictionaryResponse({ query, backend, translated, sourceLanguage, targetLanguage }) {
  return {
    query,
    text: translated,
    translation: translated,
    backend: backend.id(),
    model: backendModel(backend),
    source_language: sourceLanguage,
    target_language: targetLanguage,
  };
}

function streamChat(res, response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const base = {
    id: response.id,
    object: 'chat.completion.chunk',
    created: response.created,
    model: response.model,
  };
  const write = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
  write({ ...base, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] });
  write({ ...base, choices: [{ index: 0, delta: { content: response.choices[0].message.content }, finish_reason: null }] });
  write({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
  res.end('data: [DONE]\n\n');
}

export function createServer({ config = loadConfig(), logger = console } = {}) {
  const backends = backendList(config);
  const configuredBuiltinModel = (config.backends?.builtin_ai || config.builtinAI || {}).model;
  const defaultBackend = config.defaultBackend || 'youdao_web';
  const server = http.createServer(async (req, res) => {
    addCors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/healthz' && req.method === 'GET') {
      json(res, 200, {
        status: 'ok',
        service: 'translation-service',
        backends: statusPayload(backends),
      });
      return;
    }
    if (config.authToken && url.pathname !== '/healthz' && bearerToken(req) !== config.authToken) {
      json(res, 401, { error: { message: '未提供有效的服务认证令牌', type: 'authentication_error', code: 'authentication_error' } });
      return;
    }
    try {
      if (url.pathname === '/v1/models' && req.method === 'GET') {
        json(res, 200, {
          object: 'list',
          data: backends.map((backend) => {
            const status = backend.status();
            return {
              id: backendModel(backend),
              object: 'model',
              created: 0,
              owned_by: 'translation-service',
              available: status.available,
              ...(status.reason ? { unavailable_reason: status.reason } : {}),
            };
          }),
        });
        return;
      }
      if (req.method === 'GET' && /^\/dicts(?:\/([^/]+))?\/search$/iu.test(url.pathname)) {
        const match = url.pathname.match(/^\/dicts(?:\/([^/]+))?\/search$/iu);
        const requestedBackend = match?.[1] ? normalizeBackend(match[1], '') : defaultBackend;
        if (!requestedBackend) {
          throw new ServiceError(`未知翻译后端: ${match?.[1]}`, { code: 'unknown_backend', status: 400 });
        }
        const query = url.searchParams.get('q') ?? url.searchParams.get('text') ?? '';
        if (!query.trim()) {
          throw new ServiceError('缺少查询参数 q', { code: 'invalid_request', status: 400 });
        }
        const request = parseTranslateRequest({ backend: requestedBackend, text: query });
        const backend = resolveBackend(backends, request.backend, configuredBuiltinModel);
        const translated = await backend.translate(request);
        json(res, 200, dictionaryResponse({
          query,
          backend,
          translated,
          sourceLanguage: request.sourceLanguage,
          targetLanguage: request.targetLanguage,
        }));
        return;
      }
      if ((url.pathname === '/v1/translate' || url.pathname === '/v1/chat/completions') && req.method === 'POST') {
        const body = await readJson(req, Math.max(config.maxTextChars * 4, 1024 * 1024));
        const request = url.pathname === '/v1/translate' ? parseTranslateRequest(body) : parseChatRequest(body);
        const backend = resolveBackend(backends, request.backend || request.model || defaultBackend, configuredBuiltinModel);
        const translated = await backend.translate(request);
        if (url.pathname === '/v1/translate') {
          json(res, 200, {
            backend: backend.id(),
            model: backendModel(backend),
            text: translated,
            source_language: request.sourceLanguage,
            target_language: request.targetLanguage,
          });
          return;
        }
        const response = makeChatResponse({
          id: requestId(),
          model: request.model || backendModel(backend),
          text: translated,
          created: Math.floor(Date.now() / 1000),
        });
        if (request.stream) streamChat(res, response);
        else json(res, 200, response);
        return;
      }
      json(res, 404, { error: { message: '接口不存在', type: 'not_found', code: 'not_found' } });
    } catch (error) {
      const serviceError = asServiceError(error);
      logger.error?.(`[translation-service] ${serviceError.code}: ${serviceError.message}`);
      const response = errorPayload(serviceError);
      if (!res.headersSent) json(res, response.status, response.payload);
      else res.end();
    }
  });
  return server;
}

export function startServer({ config = loadConfig(), logger = console } = {}) {
  const server = createServer({ config, logger });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.removeListener('error', reject);
      logger.log?.(`translation-service listening on http://${config.host}:${config.port}`);
      resolve(server);
    });
  });
}
