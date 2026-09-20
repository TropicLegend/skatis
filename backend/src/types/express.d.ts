import type { RequestAuth } from '../middleware/authenticate.js';

// Augments the Express request with the identity resolved from a session token.
declare global {
  namespace Express {
    interface Request {
      auth?: RequestAuth;
    }
  }
}

export {};
