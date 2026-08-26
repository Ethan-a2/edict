import { fetchWithTimeout, readJsonResponse } from '../http.js';
import { ServiceError } from '../errors.js';
import { assertText, configuredStatus, extractAssistantContent } from './common.js';
import { languageLabel } from '../languages.js';

function chatEndpoint(endpoint) {
  const normalized = endpoint.replace(/\/+$/u, '');
  if (/\/chat\/completions$/iu.test(normalized)) return normalized;
  if (/\/v1$/iu.test(normalized)) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

export class BuiltInAIBackend {
  constructor(config) {
    this.config = config;
  }

  id() {
    return 'builtin_ai';
  }

  model() {
    return 'builtin-ai';
  }

  status() {
    return this.config.endpoint && this.config.apiKey
      ? configuredStatus(true)
      : configuredStatus(false, '需要设置 BUILTIN_AI_ENDPOINT 和 BUILTIN_AI_API_KEY');
  }

  async translate({ text, sourceLanguage = 'auto', targetLanguage = 'zh-CN' }) {
    assertText(text, this.config.maxTextChars);
    if (!this.config.endpoint || !this.config.apiKey) {
      throw new ServiceError('BuiltInAI 未配置 BUILTIN_AI_ENDPOINT/BUILTIN_AI_API_KEY', {
        code: 'backend_not_configured',
        status: 503,
      });
    }
    const response = await fetchWithTimeout(chatEndpoint(this.config.endpoint), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
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
    const translated = extractAssistantContent(body?.choices?.[0]?.message?.content).trim();
    if (!translated) {
      throw new ServiceError('BuiltInAI 未返回翻译结果', {
        code: 'empty_translation',
        status: 502,
      });
    }
    return translated;
  }
}
