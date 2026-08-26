import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import { createServer } from '../src/server.js';

function request(baseUrl, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, baseUrl);
    const requestObject = http.request(url, options, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    requestObject.on('error', reject);
    requestObject.end(options.body);
  });
}

async function startTestServer(authToken = '') {
  const server = createServer({
    config: {
      host: '127.0.0.1',
      port: 0,
      authToken,
      maxTextChars: 1000,
      timeoutMs: 2000,
      youdao: {
        keyEndpoint: 'http://127.0.0.1:1/key',
        translateEndpoint: 'http://127.0.0.1:1/translate',
      },
      caiyun: { token: '', endpoint: 'http://127.0.0.1:1/translate' },
      builtinAI: { endpoint: '', apiKey: '', model: 'test-model' },
      opencode: { bin: '/path/that/does/not/exist', model: '', dir: '', timeoutMs: 2000 },
    },
    logger: { error() {}, log() {} },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

test('server exposes health and OpenAI-compatible models', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const health = await request(baseUrl, '/healthz');
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body).backends.youdao_web.available, true);
    const models = await request(baseUrl, '/v1/models');
    assert.equal(models.status, 200);
    assert.equal(JSON.parse(models.body).object, 'list');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('server protects non-health endpoints when auth is configured', async () => {
  const { server, baseUrl } = await startTestServer('local-secret');
  try {
    const unauthorized = await request(baseUrl, '/v1/models');
    assert.equal(unauthorized.status, 401);
    const authorized = await request(baseUrl, '/v1/models', { headers: { Authorization: 'Bearer local-secret' } });
    assert.equal(authorized.status, 200);
    const health = await request(baseUrl, '/healthz');
    assert.equal(health.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('server exposes dict routes and honors backend disable switches', async () => {
  const server = createServer({
    config: {
      host: '127.0.0.1',
      port: 0,
      authToken: '',
      maxTextChars: 1000,
      timeoutMs: 2000,
      defaultBackend: 'caiyun',
      backends: {
        youdao_web: { enabled: false },
        caiyun: { enabled: false, token: '' },
        builtin_ai: { enabled: false },
        opencode: { enabled: false },
      },
    },
    logger: { error() {}, log() {} },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const response = await request(baseUrl, '/dicts/caiyun/search?q=hello');
    assert.equal(response.status, 503);
    assert.equal(JSON.parse(response.body).error.code, 'backend_disabled');
    const missingQuery = await request(baseUrl, '/dicts/search');
    assert.equal(missingQuery.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
