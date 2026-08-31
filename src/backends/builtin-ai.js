import { fetchWithTimeout, readJsonResponse } from '../http.js';
import { ServiceError } from '../errors.js';
import { assertText, configuredStatus, disabledStatus, extractAssistantContent } from './common.js';
import { languageLabel } from '../languages.js';

function chatEndpoint(endpoint) {
  const normalized = endpoint.replace(/\/+$/u, '');
  if (/\/chat\/completions$/iu.test(normalized)) return normalized;
  if (/\/v1$/iu.test(normalized)) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

function translationContent(content) {
  return extractAssistantContent(content)
    .replace(/^\s*<think>[\s\S]*?<\/think>\s*/iu, '')
    .trim();
}

export class BuiltInAIBackend {
  constructor(config) {
    this.config = config;
  }

  id() {
    return 'builtin_ai';
  }

  model() {
    return this.config.model || 'builtin-ai';
  }

  status() {
    if (this.config.enabled === false) return disabledStatus();
    return this.config.endpoint
      ? configuredStatus(true)
      : configuredStatus(false, '需要设置 BUILTIN_AI_ENDPOINT');
  }

  async translate({ text, sourceLanguage = 'auto', targetLanguage = 'zh-CN' }) {
    assertText(text, this.config.maxTextChars);
    if (this.config.enabled === false) {
      throw new ServiceError('BuiltInAI 后端已禁用', { code: 'backend_disabled', status: 503 });
    }
    if (!this.config.endpoint) {
      throw new ServiceError('BuiltInAI 未配置 BUILTIN_AI_ENDPOINT', {
        code: 'backend_not_configured',
        status: 503,
      });
    }
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;
    const response = await fetchWithTimeout(chatEndpoint(this.config.endpoint), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0,
        stream: false,
        messages: [
          {
            role: 'system',
            content: 'You are a translation engine. Return only the translation, without explanations, notes, or quotation marks. Preserve line breaks and formatting.',
          },
          {
            role: 'user',
            content: `Translate from ${languageLabel(sourceLanguage)} to ${languageLabel(targetLanguage)}.\n\n<text>\n${text}\n</text>`,
          },
        ],
      }),
    }, this.config.timeoutMs);
    const body = await readJsonResponse(response);
    const translated = translationContent(body?.choices?.[0]?.message?.content);
    if (!translated) {
      throw new ServiceError('BuiltInAI 未返回翻译结果', {
        code: 'empty_translation',
        status: 502,
      });
    }
    return translated;
  }
}
