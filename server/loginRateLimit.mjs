function identityKey(ip, username) {
  return JSON.stringify([String(ip), String(username).trim().toLowerCase()]);
}

export function createLoginRateLimiter({
  now = Date.now,
  windowMs = 900_000,
  maxFailures = 5
} = {}) {
  const failures = new Map();

  function purgeExpired(currentTime) {
    for (const [key, entry] of failures) {
      if (currentTime - entry.startedAt >= windowMs) failures.delete(key);
    }
  }

  function check(ip, username) {
    const currentTime = now();
    purgeExpired(currentTime);
    const entry = failures.get(identityKey(ip, username));
    if (!entry || entry.count < maxFailures) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const remainingMs = windowMs - (currentTime - entry.startedAt);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1_000))
    };
  }

  function recordFailure(ip, username) {
    const currentTime = now();
    purgeExpired(currentTime);
    const key = identityKey(ip, username);
    const entry = failures.get(key);
    if (entry) entry.count += 1;
    else failures.set(key, { count: 1, startedAt: currentTime });
  }

  function clear(ip, username) {
    const currentTime = now();
    purgeExpired(currentTime);
    failures.delete(identityKey(ip, username));
  }

  return { check, recordFailure, clear };
}
