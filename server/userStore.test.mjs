import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteDatabase } from './sqliteDatabase.mjs';
import { createUserStore } from './userStore.mjs';

let tempDir;
let store;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-users-'));
  const database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
  store = createUserStore({ database, now: () => new Date('2026-06-14T00:00:00.000Z') });
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe('user store', () => {
  it('registers reader users and verifies sessions', () => {
    const session = store.register({
      username: 'kite_user',
      password: 'secret123',
      nickname: 'Kite'
    });

    expect(session.user.permission).toBe('reader');
    expect(session.user.nickname).toBe('Kite');
    expect(store.listUsers()).toHaveLength(1);
  });

  it('logs in and lets admins update public identity', () => {
    const created = store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    const login = store.login({ username: 'reader01', password: 'secret123' });
    const updated = store.updateUser(created.user.id, { nickname: '新昵称', permission: 'reader' });

    expect(login.user.id).toBe(created.user.id);
    expect(updated.nickname).toBe('新昵称');
    expect(store.verify(`Bearer ${login.token}`)?.nickname).toBe('新昵称');
  });
});
