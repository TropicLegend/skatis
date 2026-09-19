import { z } from 'zod';

/**
 * Query of the change log. It is read like a page of news, so it is paginated
 * newest first – see `audit-log.ts`.
 */
export const listAuditLogQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListAuditLogQuery = z.infer<typeof listAuditLogQuery>;
