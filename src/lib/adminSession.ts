const ADMIN_SESSION_KEY = 'kitepop-admin-session';

export interface SavedAdminSession {
  token: string;
  expiresAt?: string;
}

export function loadSavedAdminSession(): SavedAdminSession | null {
  try {
    const raw = window.localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedAdminSession;
    if (!parsed.token || (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now())) {
      window.localStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveAdminSession(session: SavedAdminSession) {
  window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
}

export function clearAdminSession() {
  window.localStorage.removeItem(ADMIN_SESSION_KEY);
}
