import fs from 'node:fs';
import path from 'node:path';

function parseDotEnv(contents) {
  const values = {};
  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function readEnvFile() {
  const file = process.env.TRANSLATION_SERVICE_ENV_FILE || path.resolve('.env');
  try {
    return parseDotEnv(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return {};
  }
}

function value(envFile, key, fallback = '') {
  return process.env[key] ?? envFile[key] ?? fallback;
}

function integerValue(envFile, key, fallback) {
  const parsed = Number.parseInt(value(envFile, key, String(fallback)), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(overrides = {}) {
  const envFile = readEnvFile();
  const get = (key, fallback = '') => overrides[key] ?? value(envFile, key, fallback);
  const getInt = (key, fallback) => {
    if (overrides[key] !== undefined) {
      const parsed = Number.parseInt(String(overrides[key]), 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }
    return integerValue(envFile, key, fallback);
  };

  return {
    host: get('TRANSLATION_SERVICE_HOST', '127.0.0.1'),
    port: getInt('TRANSLATION_SERVICE_PORT', 8787),
    authToken: get('TRANSLATION_SERVICE_AUTH_TOKEN'),
    maxTextChars: getInt('TRANSLATION_SERVICE_MAX_TEXT_CHARS', 20000),
    timeoutMs: getInt('TRANSLATION_SERVICE_TIMEOUT_MS', 30000),
    youdao: {
      keyEndpoint: get('YOUDAO_KEY_ENDPOINT', 'https://dict.youdao.com/webtranslate/key'),
      translateEndpoint: get('YOUDAO_TRANSLATE_ENDPOINT', 'https://dict.youdao.com/webtranslate'),
      cookie: get('YOUDAO_COOKIE'),
    },
    caiyun: {
      token: get('CAIYUN_TOKEN'),
      endpoint: get('CAIYUN_ENDPOINT', 'https://api.interpreter.caiyunai.com/v1/translator'),
    },
    builtinAI: {
      endpoint: get('BUILTIN_AI_ENDPOINT'),
      apiKey: get('BUILTIN_AI_API_KEY'),
      model: get('BUILTIN_AI_MODEL', 'glm-4-flash-250414'),
    },
    opencode: {
      bin: get('OPENCODE_BIN', 'opencode'),
      model: get('OPENCODE_MODEL'),
      dir: get('OPENCODE_DIR'),
      timeoutMs: getInt('OPENCODE_TIMEOUT_MS', 120000),
    },
  };
}
