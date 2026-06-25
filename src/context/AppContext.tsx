import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { UserSession } from '../lib/blog';
import { AppNotification, NotificationType, createNotification } from '../lib/notification';
import { getCurrentUser } from '../lib/blogApi';
import { clearAdminSession, loadSavedAdminSession, saveAdminSession } from '../lib/adminSession';
import faviconImage from '../assets/haruhi-favicon.png';

const USER_SESSION_KEY = 'kitepop-user-session';

interface AppContextType {
  notification: AppNotification | null;
  notify: (type: NotificationType, message: string, durationMs?: number) => void;
  clearNotification: () => void;
  adminUnlocked: boolean;
  adminToken: string;
  loginAdmin: (token: string, expiresAt?: string) => void;
  logoutAdmin: () => void;
  userSession: UserSession | null;
  loginUser: (session: UserSession) => void;
  logoutUser: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function loadUserSession(): UserSession | null {
  try {
    const raw = window.localStorage.getItem(USER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserSession;
    if (!parsed.token || !parsed.expiresAt || Date.parse(parsed.expiresAt) <= Date.now()) {
      window.localStorage.removeItem(USER_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(USER_SESSION_KEY);
    return null;
  }
}

function saveUserSession(session: UserSession) {
  window.localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
}

function clearUserSession() {
  window.localStorage.removeItem(USER_SESSION_KEY);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<AppNotification | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(() => Boolean(loadSavedAdminSession()));
  const [adminToken, setAdminToken] = useState(() => loadSavedAdminSession()?.token ?? '');
  const [userSession, setUserSession] = useState<UserSession | null>(() => loadUserSession());

  useEffect(() => {
    if (!notification) return;
    const timer = window.setTimeout(() => {
      setNotification((current) => (current?.id === notification.id ? null : current));
    }, notification.durationMs);
    return () => window.clearTimeout(timer);
  }, [notification]);

  useEffect(() => {
    const saved = loadSavedAdminSession();
    if (!saved?.token) return;

    fetch('/api/admin/session', {
      headers: { Authorization: `Bearer ${saved.token}` }
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('expired');
        setAdminUnlocked(true);
        setAdminToken(saved.token);
      })
      .catch(() => {
        clearAdminSession();
        setAdminUnlocked(false);
        setAdminToken('');
      });
  }, []);

  useEffect(() => {
    const saved = loadUserSession();
    if (!saved?.token) return;
    void getCurrentUser(saved.token)
      .then((user) => {
        const session = { ...saved, user };
        saveUserSession(session);
        setUserSession(session);
      })
      .catch(() => {
        clearUserSession();
        setUserSession(null);
      });
  }, []);

  useEffect(() => {
    const head = document.head;
    let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = faviconImage;
  }, []);

  const notify = (type: NotificationType, message: string, durationMs?: number) => {
    setNotification(createNotification(type, message, durationMs));
  };

  const clearNotification = () => setNotification(null);

  const loginAdmin = (token: string, expiresAt?: string) => {
    setAdminUnlocked(true);
    setAdminToken(token);
    saveAdminSession({ token, expiresAt });
  };

  const logoutAdmin = () => {
    clearAdminSession();
    setAdminUnlocked(false);
    setAdminToken('');
  };

  const loginUser = (session: UserSession) => {
    saveUserSession(session);
    setUserSession(session);
  };

  const logoutUser = () => {
    clearUserSession();
    setUserSession(null);
  };

  return (
    <AppContext.Provider
      value={{
        notification,
        notify,
        clearNotification,
        adminUnlocked,
        adminToken,
        loginAdmin,
        logoutAdmin,
        userSession,
        loginUser,
        logoutUser
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
