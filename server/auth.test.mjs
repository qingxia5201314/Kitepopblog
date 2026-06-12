import { describe, expect, it } from 'vitest';
import { verifyAdminPassword } from './auth.mjs';

describe('admin auth', () => {
  it('accepts the configured admin password', () => {
    expect(verifyAdminPassword('strong-password', 'strong-password')).toBe(true);
  });

  it('rejects wrong or missing passwords', () => {
    expect(verifyAdminPassword('wrong', 'strong-password')).toBe(false);
    expect(verifyAdminPassword('strong-password', '')).toBe(false);
  });
});
