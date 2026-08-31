import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadConfig } from '../src/config.js';

test('uses caiyun as the default backend', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'edict-config-'));
  try {
    const config = loadConfig({
      EDICT_CWD: cwd,
      EDICT_DEFAULT_BACKEND: undefined,
      EDICT_REUSE_EASYDICT_CREDENTIALS: 'false',
      TRANSLATION_SERVICE_ENV_FILE: path.join(cwd, '.env'),
    });
    assert.equal(config.defaultBackend, 'caiyun');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('loads the local Qwen OpenAI-compatible backend configuration', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'edict-qwen-config-'));
  try {
    fs.writeFileSync(path.join(cwd, 'edict.config.json'), JSON.stringify({
      backends: {
        builtin_ai: {
          enabled: true,
          endpoint: 'http://127.0.0.1:11435/chat/completions',
          model: 'Qwen3.5-2B',
        },
      },
    }));
    const config = loadConfig({
      EDICT_CWD: cwd,
      EDICT_REUSE_EASYDICT_CREDENTIALS: 'false',
      TRANSLATION_SERVICE_ENV_FILE: path.join(cwd, '.env'),
      BUILTIN_AI_ENDPOINT: undefined,
      BUILTIN_AI_MODEL: undefined,
    });
    assert.equal(config.backends.builtin_ai.endpoint, 'http://127.0.0.1:11435/chat/completions');
    assert.equal(config.backends.builtin_ai.model, 'Qwen3.5-2B');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
