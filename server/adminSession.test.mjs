import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAdminSessionStore, createAdminSessions } from './adminSession.mjs';
import { createSqliteDatabase } from './sqliteDatabase.mjs';

let tempDir;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-admin-session-'));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe('admin sessions', () => {
  it('issues and verifies bearer tokens', () => {
    const sessions = createAdminSessions();
    const token = sessions.issue();

    expect(typeof token === 'string' ? token.length : token.token.length).toBeGreaterThan(20);
    expect(sessions.verify(`Bearer ${token}`)).toBe(true);
    expect(sessions.verify('Bearer invalid')).toBe(false);
  });

  it('keeps admin login for thirty days and stores only token hashes', async () => {
    const database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
    const store = createAdminSessionStore({ database });
    const sessions = createAdminSessions({ store, now: () => new Date('2026-06-13T00:00:00.000Z') });
    const session = sessions.issue();

    expect(session.token).toHaveLength(43);
    expect(session.expiresAt).toBe('2026-07-13T00:00:00.000Z');
    expect(store.debugListSessions()[0].tokenHash).not.toBe(session.token);
    expect(sessions.verify(`Bearer ${session.token}`)).toBe(true);

    const expiredSessions = createAdminSessions({ store, now: () => new Date('2026-07-14T00:00:00.000Z') });

    expect(expiredSessions.verify(`Bearer ${session.token}`)).toBe(false);
  });
});
