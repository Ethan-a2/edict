import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeLanguage, caiyunTransType, youdaoLanguageCode } from '../src/languages.js';
import { parseChatRequest, parseTranslateRequest } from '../src/protocol.js';

test('normalizes common language names for both Easydict backends', () => {
  assert.equal(normalizeLanguage('Simplified Chinese'), 'zh-CN');
  assert.equal(youdaoLanguageCode('zh'), 'zh-CHS');
  assert.equal(caiyunTransType('en', 'zh-CN'), 'en2zh');
});

test('parses the documented Chat Completions prompt', () => {
  const request = parseChatRequest({
    model: 'youdao-web',
    messages: [{ role: 'user', content: 'Translate into Simplified Chinese:\nhello' }],
  });
  assert.equal(request.backend, undefined);
  assert.equal(request.model, 'youdao-web');
  assert.equal(request.text, 'hello');
  assert.equal(request.sourceLanguage, 'en');
  assert.equal(request.targetLanguage, 'zh-CN');
});

test('parses explicit translation metadata', () => {
  const request = parseTranslateRequest({
    backend: 'caiyun',
    source_language: 'en',
    target_language: '中文',
    text: 'hello',
  });
  assert.equal(request.backend, 'caiyun');
  assert.equal(request.sourceLanguage, 'en');
  assert.equal(request.targetLanguage, 'zh-CN');
});

test('automatically reverses direction for Chinese input', () => {
  const request = parseTranslateRequest({ text: '你好' });
  assert.equal(request.sourceLanguage, 'zh-CN');
  assert.equal(request.targetLanguage, 'en');
});

test('rejects languages outside the Chinese-English scope', () => {
  assert.throws(
    () => parseTranslateRequest({ text: 'hello', source_language: 'ja', target_language: 'en' }),
    (error) => error.code === 'unsupported_language',
  );
});
