import type { TournamentRole } from '../lib/tokens.js';

// Augments the Express request with the identity resolved from a session token.
declare global {
  namespace Express {
    interface Request {
      auth?: {
        tournamentId: string;
        role: TournamentRole;
      };
    }
  }
}

export {};
