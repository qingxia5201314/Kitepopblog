import { useMemo, useState } from 'react';
import {
  BlogCategoryId,
  BlogPost,
  PostStatus,
  filterPosts
} from '../lib/blog';

type PostDateFilter = 'all' | '7d' | '30d' | 'year';

function filterPostsByDate(posts: BlogPost[], filter: PostDateFilter): BlogPost[] {
  if (filter === 'all') return posts;
  const now = Date.now();
  const ranges: Record<Exclude<PostDateFilter, 'all'>, number> = {
    '7d': 7,
    '30d': 30,
    year: 365
  };
  const minTime = now - ranges[filter] * 86400000;
  return posts.filter((post) => Date.parse(post.updatedAt) >= minTime);
}

export function useBlog(posts: BlogPost[]) {
  const [activeCategory, setActiveCategory] = useState<BlogCategoryId | 'all'>('all');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<PostDateFilter>('all');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [detailPostId, setDetailPostId] = useState<string | null>(() => {
    const match = window.location.hash.match(/^#\/posts\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  });

  const visiblePosts = useMemo(
    () => filterPosts(posts, { category: activeCategory, query, tags: activeTags }),
    [activeCategory, activeTags, posts, query]
  );

  const indexedPosts = useMemo(() => filterPostsByDate(visiblePosts, dateFilter), [dateFilter, visiblePosts]);

  const selectedPost = indexedPosts.find((post) => post.id === selectedPostId) ?? indexedPosts[0];
  const detailPost = posts.find((post) => post.id === detailPostId || post.slug === detailPostId) ?? null;
  const publishedCount = posts.filter((post) => post.status === 'published').length;
  const draftCount = posts.filter((post) => post.status === 'draft').length;

  const toggleActiveTag = (tag: string) => {
    setActiveTags((current) =>
      current.some((selectedTag) => selectedTag.toLowerCase() === tag.toLowerCase())
        ? current.filter((selectedTag) => selectedTag.toLowerCase() !== tag.toLowerCase())
        : [...current, tag]
    );
    setSelectedPostId(null);
    setDetailPostId(null);
  };

  const clearTags = () => setActiveTags([]);

  const openPostDetail = (post: BlogPost) => {
    setSelectedPostId(post.id);
    setDetailPostId(post.slug);
    window.location.hash = `/posts/${post.slug}`;
  };

  const closePostDetail = () => {
    setDetailPostId(null);
    window.location.hash = '';
  };

  return {
    posts,
    activeCategory,
    setActiveCategory,
    activeTags,
    toggleActiveTag,
    clearTags,
    query,
    setQuery,
    dateFilter,
    setDateFilter,
    visiblePosts,
    indexedPosts,
    selectedPost,
    selectedPostId,
    setSelectedPostId,
    detailPostId,
    setDetailPostId,
    openPostDetail,
    closePostDetail,
    detailPost,
    publishedCount,
    draftCount
  };
}
