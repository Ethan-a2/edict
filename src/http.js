import { ServiceError } from './errors.js';

export async function fetchWithTimeout(url, options = {}, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ServiceError(`上游请求超时: ${url}`, {
        code: 'upstream_timeout',
        status: 504,
        retryable: true,
      });
    }
    throw new ServiceError(`无法连接上游服务: ${error.message}`, {
      code: 'upstream_unreachable',
      status: 502,
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function readResponseText(response) {
  const text = await response.text();
  if (!response.ok) {
    throw new ServiceError(`上游服务返回 HTTP ${response.status}`, {
      code: 'upstream_http_error',
      status: response.status === 429 ? 429 : 502,
      details: text.slice(0, 1000),
      retryable: response.status === 429 || response.status >= 500,
    });
  }
  return text;
}

export async function readJsonResponse(response) {
  const text = await readResponseText(response);
  try {
    return JSON.parse(text);
  } catch {
    throw new ServiceError('上游服务返回了无效 JSON', {
      code: 'upstream_invalid_response',
      status: 502,
      details: text.slice(0, 1000),
    });
  }
}
