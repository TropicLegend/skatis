import type { RequestHandler } from 'express';

/**
 * Response headers for an API that only ever answers JSON.
 *
 * * `nosniff` – a browser must not guess another content type for an answer
 * * `no-store` – answers carry tokens and tournament data, so neither a browser
 *   nor a proxy may keep a copy
 * * the Content-Security-Policy and `X-Frame-Options` make an answer that is
 *   opened as a document inert: nothing may be loaded and it cannot be framed
 * * `no-referrer` – the address of an API call never travels on as a Referer
 *
 * HSTS is left to whatever terminates TLS in front of the API.
 */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
};
