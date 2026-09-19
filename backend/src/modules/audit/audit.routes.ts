import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { tournamentIdParams } from '../tournaments/tournament.schemas.js';
import { listAuditLog } from './audit-log.js';
import { listAuditLogQuery } from './audit-log.schemas.js';

/** Mounted below `/api/tournaments/:tournamentId/log`. */
export const auditRouter = Router({ mergeParams: true });

/**
 * The changes of the tournament, newest first. Both roles may read it: the log
 * exists so that everyone can follow what admins changed.
 */
auditRouter.get('/', authenticate(), async (req, res) => {
  const { tournamentId } = tournamentIdParams.parse(req.params);
  const query = listAuditLogQuery.parse(req.query);
  const page = await listAuditLog(tournamentId, query);

  res.json({
    data: page.entries,
    meta: { total: page.total, limit: query.limit, offset: query.offset },
  });
});
