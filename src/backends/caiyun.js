import { fetchWithTimeout, readJsonResponse } from '../http.js';
import { ServiceError } from '../errors.js';
import { assertText, configuredStatus } from './common.js';
import { caiyunTransType } from '../languages.js';

export class CaiyunBackend {
  constructor(config) {
    this.config = config;
  }

  id() {
    return 'caiyun';
  }

  model() {
    return 'caiyun';
  }

  status() {
    return this.config.token
      ? configuredStatus(true)
      : configuredStatus(false, '需要设置 CAIYUN_TOKEN');
  }

  async translate({ text, sourceLanguage = 'auto', targetLanguage = 'zh-CN' }) {
    assertText(text, this.config.maxTextChars);
    if (!this.config.token) {
      throw new ServiceError('Caiyun 未配置 CAIYUN_TOKEN', {
        code: 'backend_not_configured',
        status: 503,
      });
    }
    const transType = caiyunTransType(sourceLanguage, targetLanguage);
    if (!transType) {
      throw new ServiceError(`Caiyun 不支持语言: ${sourceLanguage} -> ${targetLanguage}`, {
        code: 'unsupported_language',
        status: 400,
      });
    }
    const response = await fetchWithTimeout(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Authorization': `token ${this.config.token}`,
      },
      body: JSON.stringify({
        source: text.split('\n'),
        trans_type: transType,
        media: 'text',
        request_id: 'translation-service',
        detect: transType.startsWith('auto'),
      }),
    }, this.config.timeoutMs);
    const body = await readJsonResponse(response);
    const targets = Array.isArray(body?.target) ? body.target : [];
    const translated = targets.map((item) => String(item ?? '')).join('\n');
    if (!translated) {
      throw new ServiceError('Caiyun 未返回翻译结果', {
        code: 'empty_translation',
        status: 502,
      });
    }
    return translated;
  }
}
