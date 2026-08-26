import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import test from 'node:test';

import { CaiyunBackend } from '../src/backends/caiyun.js';
import { BuiltInAIBackend } from '../src/backends/builtin-ai.js';
import { YoudaoWebBackend } from '../src/backends/youdao-web.js';
import { parseOpencodeOutput } from '../src/backends/opencode.js';

async function withServer(handler, callback) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function encryptYoudao(payload, aesKey, aesIv) {
  const key = crypto.createHash('md5').update(aesKey, 'utf8').digest();
  const iv = crypto.createHash('md5').update(aesIv, 'utf8').digest();
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

const baseConfig = { timeoutMs: 2000, maxTextChars: 1000 };

test('opencode parser prefers JSON text events and supports plain text fallback', () => {
  assert.equal(parseOpencodeOutput('{"type":"text","part":{"text":"你好"}}\n'), '你好');
  assert.equal(parseOpencodeOutput('diagnostic\n你好\n'), '你好');
});

test('Youdao Web adapter obtains keys and decrypts translation response', async () => {
  await withServer(async (req, res) => {
    if (req.url.startsWith('/key')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ code: 0, data: { secretKey: 'secret', aesKey: 'aes-key', aesIv: 'aes-iv' }, msg: 'OK' }));
      return;
    }
    assert.equal(req.method, 'POST');
    assert.match(req.headers['content-type'], /application\/x-www-form-urlencoded/u);
    const payload = encryptYoudao({ code: 0, translateResult: [[{ src: 'hello', tgt: '你好' }]] }, 'aes-key', 'aes-iv');
    res.end(payload);
  }, async (baseUrl) => {
    const backend = new YoudaoWebBackend({
      ...baseConfig,
      keyEndpoint: `${baseUrl}/key`,
      translateEndpoint: `${baseUrl}/translate`,
    });
    assert.equal(await backend.translate({ text: 'hello', sourceLanguage: 'en', targetLanguage: 'zh-CN' }), '你好');
  });
});

test('Caiyun adapter sends the documented request shape', async () => {
  await withServer(async (req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.headers['x-authorization'], 'token test-token');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    assert.deepEqual(body.source, ['hello']);
    assert.equal(body.trans_type, 'en2zh');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ target: ['你好'] }));
  }, async (baseUrl) => {
    const backend = new CaiyunBackend({ ...baseConfig, endpoint: baseUrl, token: 'test-token' });
    assert.equal(await backend.translate({ text: 'hello', sourceLanguage: 'en', targetLanguage: 'zh-CN' }), '你好');
  });
});

test('BuiltInAI adapter uses OpenAI-compatible Chat Completions', async () => {
  await withServer(async (req, res) => {
    assert.equal(req.url, '/v1/chat/completions');
    assert.equal(req.headers.authorization, 'Bearer test-key');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    assert.equal(body.model, 'test-model');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: '你好' } }] }));
  }, async (baseUrl) => {
    const backend = new BuiltInAIBackend({ ...baseConfig, endpoint: baseUrl, apiKey: 'test-key', model: 'test-model' });
    assert.equal(await backend.translate({ text: 'hello', sourceLanguage: 'en', targetLanguage: 'zh-CN' }), '你好');
  });
});
