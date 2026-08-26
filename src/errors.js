export class ServiceError extends Error {
  constructor(message, { code = 'internal_error', status = 500, details, retryable = false } = {}) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.retryable = retryable;
  }
}

export function asServiceError(error) {
  if (error instanceof ServiceError) return error;
  if (error?.name === 'AbortError' || error?.code === 'ETIMEDOUT') {
    return new ServiceError('上游服务请求超时', {
      code: 'upstream_timeout',
      status: 504,
      retryable: true,
    });
  }
  return new ServiceError(error?.message || '内部错误', {
    code: 'internal_error',
    status: 500,
  });
}
