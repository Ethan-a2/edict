import process from 'node:process';

import { loadConfig } from './config.js';
import { startServer } from './server.js';

function usage() {
  return `用法:
  translate-service serve [--host HOST] [--port PORT]
  translate-service translate [选项] [文本...]
  translate-service models [--server URL]
  translate-service health [--server URL]

translate 选项:
  --backend NAME       youdao_web | caiyun | builtin_ai | opencode（默认读取配置）
  --from LANG          源语言代码或名称（默认自动判断）
  --to LANG            目标语言代码或名称（默认自动判断）
  --server URL         服务地址（默认 http://127.0.0.1:8787）
  --auth-token TOKEN   服务认证令牌
  --config FILE        JSON 配置文件路径
  --json               输出完整 JSON
  --help               显示帮助

文本未通过参数传入时，从 stdin 读取。`;
}

function parseArgs(args) {
  const options = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') {
      positional.push(...args.slice(index + 1));
      break;
    }
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [key, inlineValue] = arg.slice(2).split('=', 2);
    if (key === 'help') {
      options.help = true;
      continue;
    }
    if (key === 'json') {
      options.json = true;
      continue;
    }
    const value = inlineValue ?? args[++index];
    if (value === undefined || value.startsWith('--')) throw new Error(`选项 --${key} 缺少值`);
    options[key] = value;
  }
  return { options, positional };
}

function serverUrl(options, config) {
  return String(options.server || `http://${config.host}:${config.port}`).replace(/\/+$/u, '');
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    throw new Error(body?.error?.message || `服务返回 HTTP ${response.status}`);
  }
  return body;
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function authHeaders(options) {
  return options['auth-token'] ? { Authorization: `Bearer ${options['auth-token']}` } : {};
}

async function runTranslate(options, positional, config) {
  let text = positional.join(' ');
  if (!text) text = await readStdin();
  if (!text) throw new Error('请通过参数或 stdin 提供翻译文本');
  const body = await request(`${serverUrl(options, config)}/v1/translate`, {
    method: 'POST',
    headers: { ...authHeaders(options), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      backend: options.backend || config.defaultBackend,
      text,
      ...(options.from ? { source_language: options.from } : {}),
      ...(options.to ? { target_language: options.to } : {}),
    }),
  });
  if (options.json) console.log(JSON.stringify(body, null, 2));
  else console.log(body.text);
}

async function runGet(pathname, options, config) {
  const body = await request(`${serverUrl(options, config)}${pathname}`, { headers: authHeaders(options) });
  console.log(JSON.stringify(body, null, 2));
}

export async function runCli(argv = process.argv.slice(2)) {
  const command = argv[0] || 'help';
  const { options, positional } = parseArgs(argv.slice(1));
  if (options.help || command === 'help' || command === '--help' || command === '-h') {
    console.log(usage());
    return;
  }
  const config = loadConfig({
    ...(options.config ? { EDICT_CONFIG_FILE: options.config } : {}),
    ...(command === 'serve' && options.host ? { TRANSLATION_SERVICE_HOST: options.host } : {}),
    ...(command === 'serve' && options.port ? { TRANSLATION_SERVICE_PORT: Number(options.port) } : {}),
  });
  if (command === 'serve') {
    await startServer({ config });
    return;
  }
  if (command === 'translate') {
    await runTranslate(options, positional, config);
    return;
  }
  if (command === 'models') {
    await runGet('/v1/models', options, config);
    return;
  }
  if (command === 'health') {
    await runGet('/healthz', options, config);
    return;
  }
  throw new Error(`未知命令: ${command}\n\n${usage()}`);
}
