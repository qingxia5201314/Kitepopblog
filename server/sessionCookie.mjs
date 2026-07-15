import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function sessionCookieName(secure) {
  return secure ? '__Host-kitepop_session' : 'kitepop_dev_session';
}

function cookieOptions(c) {
  return {
    path: '/',
    httpOnly: true,
    secure: Boolean(c.get('authConfig')?.secureCookies),
    sameSite: 'Lax'
  };
}

export function readSessionCookie(c) {
  const name = sessionCookieName(Boolean(c.get('authConfig')?.secureCookies));
  try {
    return getCookie(c, name) || '';
  } catch {
    return '';
  }
}

export function writeSessionCookie(c, token) {
  const options = cookieOptions(c);
  setCookie(c, sessionCookieName(options.secure), token, {
    ...options,
    maxAge: SESSION_MAX_AGE_SECONDS
  });
}

export function clearSessionCookie(c) {
  const options = cookieOptions(c);
  deleteCookie(c, sessionCookieName(options.secure), options);
}
