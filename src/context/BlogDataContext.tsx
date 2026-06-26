import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useApp } from './AppContext';
import { BlogPost } from '../lib/blog';
import { listPosts } from '../lib/blogApi';

interface BlogDataContextType {
  posts: BlogPost[];
  loadPosts: (includeDrafts?: boolean, token?: string) => Promise<void>;
}

const BlogDataContext = createContext<BlogDataContextType | undefined>(undefined);

export function BlogDataProvider({ children }: { children: ReactNode }) {
  const { adminToken, adminUnlocked, notify } = useApp();
  const [posts, setPosts] = useState<BlogPost[]>([]);

  const loadPosts = useCallback(async (includeDrafts = adminUnlocked, token = adminToken) => {
    try {
      const nextPosts = await listPosts({ includeDrafts, token });
      setPosts(nextPosts);
    } catch {
      notify('error', '文章加载失败，请稍后重试');
    }
  }, [adminToken, adminUnlocked, notify]);

  useEffect(() => {
    void loadPosts(adminUnlocked, adminToken);
  }, [adminToken, adminUnlocked, loadPosts]);

  return <BlogDataContext.Provider value={{ posts, loadPosts }}>{children}</BlogDataContext.Provider>;
}

export function useBlogData() {
  const context = useContext(BlogDataContext);
  if (!context) {
    throw new Error('useBlogData must be used within BlogDataProvider');
  }
  return context;
}
