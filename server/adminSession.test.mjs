import { describe, expect, it } from 'vitest';
import { createAdminSessions } from './adminSession.mjs';

describe('admin sessions', () => {
  it('issues and verifies bearer tokens', () => {
    const sessions = createAdminSessions();
    const token = sessions.issue();

    expect(token.length).toBeGreaterThan(20);
    expect(sessions.verify(`Bearer ${token}`)).toBe(true);
    expect(sessions.verify('Bearer invalid')).toBe(false);
  });
});
