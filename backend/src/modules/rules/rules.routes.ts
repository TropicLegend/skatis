import { Router } from 'express';
import { buildRules } from './rules.js';

/**
 * Mounted below `/api/rules`.
 *
 * Static game rules, so the endpoint needs no token: it reveals nothing about
 * any tournament. It exists so a frontend can display Grundwerte, the fixed
 * values of the null games and the size of a lineup without carrying its own
 * copy of them.
 */
export const rulesRouter = Router();

rulesRouter.get('/', (_req, res) => {
  res.json({ data: buildRules() });
});
