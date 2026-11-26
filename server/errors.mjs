/** Shared HTTP error type so route handlers can throw and stay readable. */
export class ApiError extends Error {
  constructor(status, code, message, detail) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export const badRequest = (message, detail) => new ApiError(400, 'bad_request', message, detail);
export const unauthorized = (message = 'Sign in required') =>
  new ApiError(401, 'unauthorized', message);
export const forbidden = (message = 'Not allowed') => new ApiError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new ApiError(404, 'not_found', message);
export const conflict = (message) => new ApiError(409, 'conflict', message);
export const tooMany = (message = 'Too many requests') =>
  new ApiError(429, 'rate_limited', message);

/** Wrap an async (or sync) express handler so rejections reach the error middleware. */
export function handler(fn) {
  return (req, res, next) => {
    try {
      const result = fn(req, res, next);
      if (result && typeof result.catch === 'function') result.catch(next);
    } catch (error) {
      next(error);
    }
  };
}
