const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function normalizedHttpOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function createOriginGuard({ production, siteUrl }) {
  const expectedProductionOrigin = production ? normalizedHttpOrigin(siteUrl) : null;
  if (production && !expectedProductionOrigin) {
    throw new Error('SITE_URL must be a valid HTTP(S) URL in production');
  }

  return async function originGuard(c, next) {
    if (SAFE_METHODS.has(c.req.method)) return next();

    const originHeader = c.req.header('Origin');
    if (!production && originHeader === undefined) return next();

    const suppliedOrigin = normalizedHttpOrigin(originHeader);
    const expectedOrigin = production ? expectedProductionOrigin : new URL(c.req.url).origin;
    if (!suppliedOrigin || suppliedOrigin !== expectedOrigin) {
      return c.json({ ok: false, message: 'Forbidden' }, 403);
    }

    return next();
  };
}
