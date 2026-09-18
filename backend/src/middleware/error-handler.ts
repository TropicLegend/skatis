import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

interface MappedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

interface BodyParserError extends Error {
  status?: number;
  type?: string;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  if (!(error instanceof Error)) return false;
  const { type } = error as BodyParserError;
  return type === 'entity.parse.failed' || type === 'entity.too.large';
}

function mapZodError(error: ZodError): MappedError {
  return {
    status: 422,
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    details: {
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        code: issue.code,
        message: issue.message,
      })),
    },
  };
}

function mapPrismaError(error: Prisma.PrismaClientKnownRequestError): MappedError {
  switch (error.code) {
    case 'P2002':
      return {
        status: 409,
        code: 'CONFLICT',
        message: 'A resource with these values already exists',
      };
    case 'P2025':
      return { status: 404, code: 'NOT_FOUND', message: 'Resource not found' };
    case 'P2003':
      return {
        status: 409,
        code: 'CONFLICT',
        message: 'The operation violates a relational constraint',
      };
    default:
      return { status: 500, code: 'INTERNAL_ERROR', message: 'Database error' };
  }
}

function mapError(error: unknown): MappedError {
  if (error instanceof HttpError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof ZodError) {
    return mapZodError(error);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return mapPrismaError(error);
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'Database is unavailable' };
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return { status: 500, code: 'INTERNAL_ERROR', message: 'Database query validation failed' };
  }

  if (isBodyParserError(error)) {
    if (error.type === 'entity.too.large') {
      return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' };
    }
    return { status: 400, code: 'BAD_REQUEST', message: 'Malformed JSON request body' };
  }

  return { status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' };
}

/** Central error handler – converts every thrown value into the error envelope. */
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const { status, code, message, details } = mapError(error);
  const requestId = res.locals.requestId as string | undefined;

  if (status >= 500) {
    logger.error(
      { requestId, method: req.method, path: req.originalUrl, status, code, err: error },
      'request failed',
    );
  } else {
    logger.warn(
      { requestId, method: req.method, path: req.originalUrl, status, code },
      'request rejected',
    );
  }

  const body: ErrorResponseBody = { error: { code, message, requestId } };
  if (details !== undefined) {
    body.error.details = details;
  }

  res.status(status).json(body);
};
