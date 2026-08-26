import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadEasydictCredentials } from './credentials.js';

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

function parseJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`无法读取配置文件 ${file}: ${error.message}`);
  }
}

function readEnvFile(envFilePath) {
  try {
    return parseDotEnv(fs.readFileSync(envFilePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return {};
  }
}

function readConfigFile(configFilePath) {
  if (!configFilePath) return {};
  return parseJsonFile(configFilePath);
}

function nestedValue(object, keys, fallback) {
  let current = object;
  for (const key of keys) {
    if (!current || typeof current !== 'object' || !(key in current)) return fallback;
    current = current[key];
  }
  return current;
}

function firstValue(values, fallback = '') {
  return values.find((value) => value !== undefined && value !== null) ?? fallback;
}

function firstNonEmpty(values, fallback = '') {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') ?? fallback;
}

function booleanValue(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value).trim().toLowerCase());
}

function integerValue(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envOrConfig({ env, config, envKey, configPath, fallback }) {
  return firstValue([env[envKey], nestedValue(config, configPath, undefined)], fallback);
}

function enabledValue({ env, config, envKey, configPath, fallback = true }) {
  return booleanValue(envOrConfig({ env, config, envKey, configPath, fallback }), fallback);
}

export function loadConfig(overrides = {}) {
  const cwd = overrides.EDICT_CWD || process.cwd();
  const envFilePath = overrides.TRANSLATION_SERVICE_ENV_FILE
    || process.env.TRANSLATION_SERVICE_ENV_FILE
    || path.join(cwd, '.env');
  const env = { ...readEnvFile(envFilePath), ...process.env, ...overrides };
  const configFilePath = env.EDICT_CONFIG_FILE
    ? path.resolve(cwd, env.EDICT_CONFIG_FILE)
    : path.join(cwd, 'edict.config.json');
  const fileConfig = readConfigFile(configFilePath);
  const get = (envKey, configPath, fallback = '') => envOrConfig({ env, config: fileConfig, envKey, configPath, fallback });
  const getInt = (envKey, configPath, fallback) => integerValue(get(envKey, configPath, fallback), fallback);

  const reuseEasydictCredentials = enabledValue({
    env,
    config: fileConfig,
    envKey: 'EDICT_REUSE_EASYDICT_CREDENTIALS',
    configPath: ['credentials', 'easydict', 'enabled'],
    fallback: true,
  });
  const easydictCredentialConfig = {
    enabled: reuseEasydictCredentials,
    path: get('EASYDICT_SECRET_KEYS_PATH', ['credentials', 'easydict', 'path']),
    root: get('EASYDICT_ROOT', ['credentials', 'easydict', 'root']),
    bundleName: get('EASYDICT_BUNDLE_NAME', ['credentials', 'easydict', 'bundleName'], 'Easydict'),
  };
  const easydictCredentials = loadEasydictCredentials(easydictCredentialConfig);
  const discovered = easydictCredentials.values;

  const getSecret = (envKey, configPath, discoveredKey, fallback = '') => firstNonEmpty([
    env[envKey],
    nestedValue(fileConfig, configPath, undefined),
    discovered[discoveredKey],
    fallback,
  ], fallback);

  return {
    host: firstValue([env.TRANSLATION_SERVICE_HOST, nestedValue(fileConfig, ['server', 'host'], undefined), fileConfig.host, '127.0.0.1']),
    port: integerValue(firstValue([env.TRANSLATION_SERVICE_PORT, nestedValue(fileConfig, ['server', 'port'], undefined), fileConfig.port, 8787]), 8787),
    authToken: get('TRANSLATION_SERVICE_AUTH_TOKEN', ['server', 'authToken']),
    maxTextChars: getInt('TRANSLATION_SERVICE_MAX_TEXT_CHARS', ['server', 'maxTextChars'], 20000),
    timeoutMs: getInt('TRANSLATION_SERVICE_TIMEOUT_MS', ['server', 'timeoutMs'], 30000),
    defaultBackend: get('EDICT_DEFAULT_BACKEND', ['defaultBackend'], 'caiyun'),
    credentials: {
      easydict: {
        ...easydictCredentialConfig,
        source: easydictCredentials.source,
      },
    },
    backends: {
      youdao_web: {
        enabled: enabledValue({ env, config: fileConfig, envKey: 'YOUDAO_ENABLED', configPath: ['backends', 'youdao_web', 'enabled'] }),
        keyEndpoint: get('YOUDAO_KEY_ENDPOINT', ['backends', 'youdao_web', 'keyEndpoint'], 'https://dict.youdao.com/webtranslate/key'),
        translateEndpoint: get('YOUDAO_TRANSLATE_ENDPOINT', ['backends', 'youdao_web', 'translateEndpoint'], 'https://dict.youdao.com/webtranslate'),
        cookie: get('YOUDAO_COOKIE', ['backends', 'youdao_web', 'cookie']),
      },
      caiyun: {
        enabled: enabledValue({ env, config: fileConfig, envKey: 'CAIYUN_ENABLED', configPath: ['backends', 'caiyun', 'enabled'] }),
        token: getSecret('CAIYUN_TOKEN', ['backends', 'caiyun', 'token'], 'caiyunToken'),
        endpoint: get('CAIYUN_ENDPOINT', ['backends', 'caiyun', 'endpoint'], 'https://api.interpreter.caiyunai.com/v1/translator'),
      },
      builtin_ai: {
        enabled: enabledValue({ env, config: fileConfig, envKey: 'BUILTIN_AI_ENABLED', configPath: ['backends', 'builtin_ai', 'enabled'] }),
        endpoint: getSecret('BUILTIN_AI_ENDPOINT', ['backends', 'builtin_ai', 'endpoint'], 'builtInAIEndpoint'),
        apiKey: getSecret('BUILTIN_AI_API_KEY', ['backends', 'builtin_ai', 'apiKey'], 'builtInAIAPIKey'),
        model: get('BUILTIN_AI_MODEL', ['backends', 'builtin_ai', 'model'], 'glm-4-flash-250414'),
      },
      opencode: {
        enabled: enabledValue({ env, config: fileConfig, envKey: 'OPENCODE_ENABLED', configPath: ['backends', 'opencode', 'enabled'] }),
        bin: get('OPENCODE_BIN', ['backends', 'opencode', 'bin'], 'opencode'),
        model: get('OPENCODE_MODEL', ['backends', 'opencode', 'model']),
        dir: get('OPENCODE_DIR', ['backends', 'opencode', 'dir'], os.tmpdir()),
        timeoutMs: getInt('OPENCODE_TIMEOUT_MS', ['backends', 'opencode', 'timeoutMs'], 120000),
      },
    },
  };
}
