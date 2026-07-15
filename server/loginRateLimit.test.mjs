import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLoginRateLimiter } from './loginRateLimit.mjs';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createLoginRateLimiter', () => {
  it('allows five recorded failures and blocks the sixth attempt with the default window', () => {
    let currentTime = 1_000;
    const limiter = createLoginRateLimiter({ now: () => currentTime });

    for (let failure = 0; failure < 5; failure += 1) {
      expect(limiter.check('203.0.113.10', 'admin')).toEqual({ allowed: true, retryAfterSeconds: 0 });
      limiter.recordFailure('203.0.113.10', 'admin');
    }

    currentTime += 1;
    expect(limiter.check('203.0.113.10', 'admin')).toEqual({
      allowed: false,
      retryAfterSeconds: 900
    });
  });

  it('anchors the window at the first failure and rounds remaining time up', () => {
    let currentTime = 10_000;
    const limiter = createLoginRateLimiter({ now: () => currentTime, windowMs: 2_500, maxFailures: 2 });

    limiter.recordFailure('198.51.100.4', 'admin');
    currentTime = 10_600;
    limiter.recordFailure('198.51.100.4', 'admin');

    currentTime = 11_001;
    expect(limiter.check('198.51.100.4', 'admin')).toEqual({
      allowed: false,
      retryAfterSeconds: 2
    });

    currentTime = 12_499;
    expect(limiter.check('198.51.100.4', 'admin')).toEqual({
      allowed: false,
      retryAfterSeconds: 1
    });
  });

  it('expires at the exact window boundary and recordFailure starts a fresh window', () => {
    let currentTime = 0;
    const limiter = createLoginRateLimiter({ now: () => currentTime, windowMs: 1_000, maxFailures: 2 });

    limiter.recordFailure('192.0.2.1', 'reader');
    limiter.recordFailure('192.0.2.1', 'reader');
    currentTime = 1_000;
    expect(limiter.check('192.0.2.1', 'reader')).toEqual({ allowed: true, retryAfterSeconds: 0 });

    limiter.recordFailure('192.0.2.1', 'reader');
    expect(limiter.check('192.0.2.1', 'reader')).toEqual({ allowed: true, retryAfterSeconds: 0 });
    limiter.recordFailure('192.0.2.1', 'reader');
    expect(limiter.check('192.0.2.1', 'reader')).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it('normalizes usernames but preserves the trusted IP string exactly', () => {
    const limiter = createLoginRateLimiter({ now: () => 5_000, maxFailures: 1 });

    limiter.recordFailure(' 203.0.113.7 ', '  AdMiN  ');

    expect(limiter.check(' 203.0.113.7 ', 'admin')).toEqual({
      allowed: false,
      retryAfterSeconds: 900
    });
    expect(limiter.check('203.0.113.7', 'admin')).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('isolates IP and username pairs without concatenation collisions', () => {
    const limiter = createLoginRateLimiter({ now: () => 7_000, maxFailures: 1 });

    limiter.recordFailure('ab', 'c');
    limiter.recordFailure('same-ip', 'first-user');

    expect(limiter.check('a', 'bc')).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.check('other-ip', 'c')).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.check('same-ip', 'second-user')).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('clear removes only the normalized matching identity', () => {
    const limiter = createLoginRateLimiter({ now: () => 9_000, maxFailures: 1 });

    limiter.recordFailure('203.0.113.1', 'Admin');
    limiter.recordFailure('203.0.113.2', 'admin');
    limiter.clear('203.0.113.1', ' ADMIN ');

    expect(limiter.check('203.0.113.1', 'admin')).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.check('203.0.113.2', 'admin')).toEqual({
      allowed: false,
      retryAfterSeconds: 900
    });
  });

  it('uses Date.now by default', () => {
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(20_000);
    const limiter = createLoginRateLimiter({ windowMs: 1_500, maxFailures: 1 });
    limiter.recordFailure('127.0.0.1', 'admin');

    dateNow.mockReturnValue(20_001);
    expect(limiter.check('127.0.0.1', 'admin')).toEqual({
      allowed: false,
      retryAfterSeconds: 2
    });
  });
});
