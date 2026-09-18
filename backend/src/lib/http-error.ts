/** Error type carrying an HTTP status code and a stable machine readable error code. */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown): HttpError =>
  new HttpError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'Authentication required'): HttpError =>
  new HttpError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You are not allowed to perform this action'): HttpError =>
  new HttpError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Resource not found'): HttpError =>
  new HttpError(404, 'NOT_FOUND', message);

export const conflict = (message: string, details?: unknown): HttpError =>
  new HttpError(409, 'CONFLICT', message, details);

export const validationError = (
  message = 'Request validation failed',
  details?: unknown,
): HttpError => new HttpError(422, 'VALIDATION_ERROR', message, details);

export const tooManyRequests = (message = 'Too many requests'): HttpError =>
  new HttpError(429, 'TOO_MANY_REQUESTS', message);

export const serviceUnavailable = (message = 'Service unavailable'): HttpError =>
  new HttpError(503, 'SERVICE_UNAVAILABLE', message);
