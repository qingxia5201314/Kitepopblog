import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BlogPost, UserSession } from '../lib/blog';
import { AppNotification, NotificationType, createNotification } from '../lib/notification';
import { listPosts, getCurrentUser } from '../lib/blogApi';
import faviconImage from '../assets/haruhi-favicon.png';

const ADMIN_SESSION_KEY = 'kitepop-admin-session';
const USER_SESSION_KEY = 'kitepop-user-session';

interface AppContextType {
  // Notification state
  notification: AppNotification | null;
  notify: (type: NotificationType, message: string, durationMs?: number) => void;
  clearNotification: () => void;

  // Admin auth state
  adminUnlocked: boolean;
  adminToken: string;
  loginAdmin: (token: string, expiresAt?: string) => void;
  logoutAdmin: () => void;

  // User auth state
  userSession: UserSession | null;
  loginUser: (session: UserSession) => void;
  logoutUser: () => void;

  // Posts state
  posts: BlogPost[];
  loadPosts: (includeDrafts?: boolean, token?: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function loadAdminSession(): { token: string; expiresAt?: string } | null {
  try {
    const raw = window.localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string; expiresAt?: string };
    if (!parsed.token || (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now())) {
      window.localStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }
    return { token: parsed.token, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function saveAdminSession(session: { token: string; expiresAt?: string }) {
  window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
}

function clearAdminSession() {
  window.localStorage.removeItem(ADMIN_SESSION_KEY);
}

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
  const [adminUnlocked, setAdminUnlocked] = useState(() => Boolean(loadAdminSession()));
  const [adminToken, setAdminToken] = useState(() => loadAdminSession()?.token ?? '');
  const [userSession, setUserSession] = useState<UserSession | null>(() => loadUserSession());
  const [posts, setPosts] = useState<BlogPost[]>([]);

  // Notification auto-clear effect
  useEffect(() => {
    if (!notification) return;
    const timer = window.setTimeout(() => {
      setNotification((current) => (current?.id === notification.id ? null : current));
    }, notification.durationMs);
    return () => window.clearTimeout(timer);
  }, [notification]);

  // Verify admin session on mount
  useEffect(() => {
    const saved = loadAdminSession();
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

  // Verify user session on mount
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

  // Setup favicon on mount
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

  const clearNotificationFn = () => setNotification(null);

  const loadPosts = useCallback(async (includeDrafts = adminUnlocked, token = adminToken) => {
    try {
      const nextPosts = await listPosts({ includeDrafts, token });
      setPosts(nextPosts);
    } catch {
      notify('error', '文章加载失败，请稍后重试');
    }
  }, [adminToken, adminUnlocked]);

  useEffect(() => {
    void loadPosts(adminUnlocked, adminToken);
  }, [adminToken, adminUnlocked, loadPosts]);

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

  const loginUserFn = (session: UserSession) => {
    saveUserSession(session);
    setUserSession(session);
  };

  const logoutUserFn = () => {
    clearUserSession();
    setUserSession(null);
  };

  const value: AppContextType = {
    notification,
    notify,
    clearNotification: clearNotificationFn,
    adminUnlocked,
    adminToken,
    loginAdmin,
    logoutAdmin,
    userSession,
    loginUser: loginUserFn,
    logoutUser: logoutUserFn,
    posts,
    loadPosts
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
