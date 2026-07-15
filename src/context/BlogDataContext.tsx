import { ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useApp } from './AppContext';
import { BlogPost } from '../lib/blog';
import { listPosts } from '../lib/blogApi';

interface BlogDataContextType {
  posts: BlogPost[];
  loadPosts: (includeDrafts?: boolean) => Promise<void>;
}

const BlogDataContext = createContext<BlogDataContextType | undefined>(undefined);

export function BlogDataProvider({ children }: { children: ReactNode }) {
  const { isAdmin, notify } = useApp();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const requestGenerationRef = useRef(0);

  const loadPosts = useCallback(async (includeDrafts = isAdmin) => {
    const generation = ++requestGenerationRef.current;
    try {
      const nextPosts = await listPosts({ includeDrafts, summary: !includeDrafts });
      if (generation === requestGenerationRef.current) setPosts(nextPosts);
    } catch {
      if (generation === requestGenerationRef.current) notify('error', '文章加载失败，请稍后重试');
    }
  }, [isAdmin, notify]);

  useEffect(() => {
    void loadPosts(isAdmin);
  }, [isAdmin, loadPosts]);

  return <BlogDataContext.Provider value={{ posts, loadPosts }}>{children}</BlogDataContext.Provider>;
}

export function useBlogData() {
  const context = useContext(BlogDataContext);
  if (!context) {
    throw new Error('useBlogData must be used within BlogDataProvider');
  }
  return context;
}
