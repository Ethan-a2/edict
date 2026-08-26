import crypto from 'node:crypto';

import { fetchWithTimeout, readJsonResponse, readResponseText } from '../http.js';
import { ServiceError } from '../errors.js';
import { assertText, configuredStatus } from './common.js';
import { normalizeLanguage, youdaoLanguageCode } from '../languages.js';

const client = 'fanyideskweb';
const product = 'webfanyi';
const defaultKey = 'asdjnjfenknafdfsdfsd';

function timestamp() {
  return String(Date.now());
}

function md5(value) {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex');
}

function sign(mysticTime, key) {
  return md5(`client=${client}&mysticTime=${mysticTime}&product=${product}&key=${key}`);
}

function generalParameters() {
  return {
    client,
    product,
    appVersion: '1.0.0',
    vendor: 'web',
    pointParam: 'client,mysticTime,product',
    keyfrom: 'fanyi.web',
    keyid: '',
    sign: '',
    mysticTime: '',
  };
}

function queryString(parameters) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) query.set(key, value);
  return query.toString();
}

function headers(cookie = '') {
  const result = {
    Accept: '*/*',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
    Referer: 'https://fanyi.youdao.com/',
  };
  if (cookie) result.Cookie = cookie;
  return result;
}

function decryptResponse(encryptedText, aesKey, aesIv) {
  const normalized = encryptedText.trim().replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const encrypted = Buffer.from(padded, 'base64');
  if (!encrypted.length) throw new Error('empty encrypted response');
  const key = crypto.createHash('md5').update(aesKey, 'utf8').digest();
  const iv = crypto.createHash('md5').update(aesIv, 'utf8').digest();
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export class YoudaoWebBackend {
  constructor(config) {
    this.config = config;
    this.cachedKey = undefined;
    this.keyCacheMs = 5 * 60 * 1000;
  }

  id() {
    return 'youdao_web';
  }

  model() {
    return 'youdao-web';
  }

  status() {
    return configuredStatus(true);
  }

  async getKey() {
    if (this.cachedKey && this.cachedKey.expiresAt > Date.now()) return this.cachedKey.value;
    const mysticTime = timestamp();
    const parameters = {
      ...generalParameters(),
      keyid: 'webfanyi-key-getter',
      sign: sign(mysticTime, defaultKey),
      mysticTime,
    };
    const endpoint = `${this.config.keyEndpoint}?${queryString(parameters)}`;
    const response = await fetchWithTimeout(endpoint, { headers: headers(this.config.cookie) }, this.config.timeoutMs);
    const body = await readJsonResponse(response);
    if (body?.code !== 0 || !body?.data?.secretKey || !body?.data?.aesKey || !body?.data?.aesIv) {
      throw new ServiceError('Youdao Web 动态密钥获取失败', {
        code: 'youdao_key_error',
        status: 502,
      });
    }
    this.cachedKey = { value: body.data, expiresAt: Date.now() + this.keyCacheMs };
    return body.data;
  }

  async translate({ text, sourceLanguage = 'auto', targetLanguage = 'zh-CN' }) {
    assertText(text, this.config.maxTextChars);
    const from = youdaoLanguageCode(sourceLanguage);
    const to = youdaoLanguageCode(targetLanguage);
    if (!from || !to) {
      throw new ServiceError(`Youdao Web 不支持语言: ${sourceLanguage} -> ${targetLanguage}`, {
        code: 'unsupported_language',
        status: 400,
      });
    }
    const key = await this.getKey();
    const mysticTime = timestamp();
    const body = {
      ...generalParameters(),
      i: text,
      from,
      to,
      dictResult: 'false',
      keyid: 'webfanyi',
      sign: sign(mysticTime, key.secretKey),
      mysticTime,
    };
    const response = await fetchWithTimeout(this.config.translateEndpoint, {
      method: 'POST',
      headers: {
        ...headers(this.config.cookie),
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: queryString(body),
    }, this.config.timeoutMs);
    const encrypted = await readResponseText(response);
    let parsed;
    try {
      parsed = JSON.parse(decryptResponse(encrypted, key.aesKey, key.aesIv));
    } catch {
      throw new ServiceError('Youdao Web 响应解密或解析失败', {
        code: 'upstream_invalid_response',
        status: 502,
      });
    }
    if (parsed?.code !== 0) {
      throw new ServiceError(`Youdao Web 翻译失败（code=${parsed?.code ?? 'unknown'}）`, {
        code: 'youdao_translation_error',
        status: 502,
      });
    }
    const translated = (parsed.translateResult || [])
      .flatMap((group) => group || [])
      .map((item) => item?.tgt || '')
      .join('');
    if (!translated) {
      throw new ServiceError('Youdao Web 未返回翻译结果', {
        code: 'empty_translation',
        status: 502,
      });
    }
    return translated;
  }
}
