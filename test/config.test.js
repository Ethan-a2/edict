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
