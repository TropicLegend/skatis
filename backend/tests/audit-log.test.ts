import type { AuditLog as AuditLogRow } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, toAuditLogEntryDto } from '../src/modules/audit/audit-log.js';

function row(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    id: 'log-1',
    tournamentId: 'K7M2P4QX',
    role: 'ADMIN',
    action: 'list.deleted',
    details: { listId: 'list-1', gameCount: 5 },
    createdAt: new Date('2026-09-19T20:15:00.000Z'),
    ...overrides,
  } satisfies AuditLogRow;
}

describe('AUDIT_ACTIONS', () => {
  it('lists every action exactly once', () => {
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
  });

  it('uses namespaced keys so the frontend can word them', () => {
    for (const action of AUDIT_ACTIONS) {
      expect(action).toMatch(/^[a-z]+\.[a-z_]+$/);
    }
  });
});

describe('toAuditLogEntryDto', () => {
  it('keeps the role and the action and serialises the timestamp', () => {
    expect(toAuditLogEntryDto(row())).toEqual({
      id: 'log-1',
      createdAt: '2026-09-19T20:15:00.000Z',
      role: 'ADMIN',
      action: 'list.deleted',
      details: { listId: 'list-1', gameCount: 5 },
    });
  });

  it('reports an empty details column as null', () => {
    expect(toAuditLogEntryDto(row({ details: null })).details).toBeNull();
  });

  it('keeps entries of members apart from admin entries', () => {
    expect(toAuditLogEntryDto(row({ role: 'MEMBER' })).role).toBe('MEMBER');
  });
});
