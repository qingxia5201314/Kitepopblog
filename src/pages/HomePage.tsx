import React, { useState, useCallback, useMemo, FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { useBlog } from '../hooks/useBlog';
import {
  BLOG_CATEGORIES,
  BlogCategoryId,
  BlogPost,
  calculateReadingMinutes,
  filterPosts,
  getCategory,
  getCategoryIcon
} from '../lib/blog';
import {
  listPostComments,
  createPostComment,
  updatePostComment,
  deletePostComment
} from '../lib/blogApi';
import {
  Icon,
  FilterMenu,
  ImageWithFallback,
  formatDateTime,
  getSafeImageUrl,
  renderMarkdown,
  renderInlineMarkdown,
  permissionLabel
} from '../components/shared';
import haruhiCutoutImage from '../assets/haruhi-cutout.webp';

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

interface CommentFormState {
  content: string;
}

export function HomePage() {
  const { userSession, notify, posts } = useApp();
  const {
    activeCategory,
    setActiveCategory,
    activeTags,
    toggleActiveTag,
    clearTags,
    query,
    setQuery,
    detailPost,
    openPostDetail,
    closePostDetail
  } = useBlog(posts);

  const [postComments, setPostComments] = useState<any[]>([]);
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentForm, setCommentForm] = useState<CommentFormState>({ content: '' });
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentEditDrafts, setCommentEditDrafts] = useState<Record<string, string>>({});
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [userForm, setUserForm] = useState({ username: '', password: '', nickname: '' });

  const visiblePosts = useMemo(
    () => filterPosts(posts, { category: activeCategory, query, tags: activeTags }),
    [activeCategory, activeTags, query, posts]
  );

  const indexedPosts = useMemo(
    () => filterPostsByDate(visiblePosts, 'all'),
    [visiblePosts]
  );

  const publishedCount = posts.filter((post) => post.status === 'published').length;
  const draftCount = posts.filter((post) => post.status === 'draft').length;

  const handleCommentSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!detailPost || commentLoading) return;
      if (!userSession) {
        notify('error', '请先登录后再评论');
        return;
      }
      if (!commentForm.content.trim()) {
        notify('error', '请填写评论内容');
        return;
      }

      try {
        const comment = await createPostComment(detailPost.slug, commentForm, userSession.token);
        setPostComments([comment, ...postComments]);
        setCommentForm({ content: '' });
        notify('success', '评论已发布');
      } catch (error) {
        notify('error', error instanceof Error ? error.message : '评论发布失败');
      }
    },
    [detailPost, commentLoading, userSession, commentForm, postComments, notify]
  );

  const handleEditComment = useCallback(
    (commentId: string, content: string) => {
      setEditingCommentId(commentId);
      setCommentEditDrafts((current) => ({ ...current, [commentId]: content }));
    },
    []
  );

  const handleSaveEdit = useCallback(
    async (commentId: string) => {
      if (!detailPost || !userSession) return;
      const content = (commentEditDrafts[commentId] ?? '').trim();
      if (!content) {
        notify('error', '评论内容不能为空');
        return;
      }

      try {
        const updated = await updatePostComment(
          detailPost.slug,
          commentId,
          { content },
          userSession.token
        );
        setPostComments(postComments.map((item) => (item.id === updated.id ? updated : item)));
        setEditingCommentId(null);
        notify('success', '评论已更新');
      } catch (error) {
        notify('error', error instanceof Error ? error.message : '评论更新失败');
      }
    },
    [detailPost, userSession, commentEditDrafts, postComments, notify]
  );

  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      if (!detailPost || !userSession) return;
      if (!window.confirm('确定删除这条评论吗？')) return;

      try {
        await deletePostComment(detailPost.slug, commentId, userSession.token);
        setPostComments(postComments.filter((item) => item.id !== commentId));
        if (editingCommentId === commentId) setEditingCommentId(null);
        notify('success', '评论已删除');
      } catch (error) {
        notify('error', error instanceof Error ? error.message : '评论删除失败');
      }
    },
    [detailPost, userSession, postComments, editingCommentId, notify]
  );

  // Detail view
  if (detailPost) {
    return (
      <section className="article-page">
        <div className="article-page-shell">
          <aside className="article-page-rail">
            <button className="back-link" onClick={closePostDetail} type="button">
              返回文章列表
            </button>
            <div className="article-rail-card">
              <p className="eyebrow">Reading Focus</p>
              <strong>{getCategory(detailPost.category).name}</strong>
              <span>{formatDateTime(detailPost.updatedAt)}</span>
              <span>{calculateReadingMinutes(detailPost.content)} 分钟阅读</span>
            </div>
            <div className="article-rail-card">
              <p className="eyebrow">Active Tags</p>
              <div className="tag-row article-rail-tags">
                {detailPost.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={activeTags.includes(tag) ? 'active' : ''}
                    onClick={() => { toggleActiveTag(tag); closePostDetail(); }}
                  >
                    <Icon name="tag" />
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </aside>
          <div className="article-page-main">
            <section className="article-header-card">
              <div className="article-header-media">
                <ImageWithFallback
                  alt={detailPost.title}
                  className="article-cover-image"
                  src={getSafeImageUrl(detailPost.coverImage)}
                  fallback={
                    <div className={`article-cover cover-${detailPost.cover}`}>
                    <span>
                      <Icon name={getCategoryIcon(detailPost.category)} />
                      {getCategory(detailPost.category).name}
                    </span>
                    </div>
                  }
                />
              </div>
              <div className="article-header-copy">
                <p className="article-meta">
                  <span>
                    <Icon name="calendar" />
                    {formatDateTime(detailPost.updatedAt)}
                  </span>
                  <span>
                    <Icon name="clock" />
                    {calculateReadingMinutes(detailPost.content)} 分钟阅读
                  </span>
                  <span>
                    <Icon name={getCategoryIcon(detailPost.category)} />
                    {getCategory(detailPost.category).name}
                  </span>
                </p>
                <h1>{detailPost.title}</h1>
                <p className="summary">{detailPost.summary}</p>
                <div className="tag-row">
                  {detailPost.tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={activeTags.includes(tag) ? 'active' : ''}
                      onClick={() => { toggleActiveTag(tag); closePostDetail(); }}
                    >
                      <Icon name="tag" />
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </section>
            <section className="article-body-card">
              <div className="article-body">{renderMarkdown(detailPost.content)}</div>
            </section>
            <section className="comment-panel">
              <div className="panel-heading">
                <h3>评论 · {postComments.length}</h3>
                {userSession ? (
                  <div className="comment-user-chip">
                    <strong>{userSession.user.nickname}</strong>
                    <span>{permissionLabel(userSession.user.permission)}</span>
                  </div>
                ) : null}
              </div>
              {userSession ? (
                <form className="comment-form" onSubmit={handleCommentSubmit}>
                  <textarea
                    aria-label="评论内容"
                    onChange={(event) =>
                      setCommentForm((current) => ({ ...current, content: event.target.value }))
                    }
                    placeholder="写点想法..."
                    value={commentForm.content}
                  />
                  <button disabled={commentLoading} type="submit">
                    {commentLoading ? '发布中...' : '发布评论'}
                  </button>
                </form>
              ) : (
                <div className="comment-empty-card">
                  <strong>登录后可评论</strong>
                  <p>注册后默认只有阅读权限，评论会自动显示你的昵称和权限身份。</p>
                </div>
              )}
              <div className="comment-list">
                {postComments.map((comment: any) => (
                  <article className="comment-item" key={comment.id}>
                    <strong>
                      {comment.nickname}
                      <span>{comment.role}</span>
                    </strong>
                    {editingCommentId === comment.id ? (
                      <div className="comment-edit-box">
                        <textarea
                          aria-label="编辑评论"
                          onChange={(event) =>
                            setCommentEditDrafts((current) => ({
                              ...current,
                              [comment.id]: event.target.value
                            }))
                          }
                          value={commentEditDrafts[comment.id] ?? ''}
                        />
                        <div className="comment-actions">
                          <button onClick={() => handleSaveEdit(comment.id)} type="button">
                            保存
                          </button>
                          <button
                            className="ghost"
                            onClick={() => setEditingCommentId(null)}
                            type="button"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p>{comment.content}</p>
                    )}
                    <div className="comment-meta">
                      <small>{formatDateTime(comment.updatedAt || comment.createdAt)}</small>
                      {userSession &&
                      (userSession.user.permission === 'admin' || comment.userId === userSession.user.id) ? (
                        <div className="comment-actions">
                          <button
                            className="ghost"
                            onClick={() => handleEditComment(comment.id, comment.content)}
                            type="button"
                          >
                            编辑
                          </button>
                          <button
                            className="danger"
                            onClick={() => handleDeleteComment(comment.id)}
                            type="button"
                          >
                            删除
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
                {postComments.length === 0 ? <div className="empty-state">还没有评论。</div> : null}
              </div>
            </section>
          </div>
        </div>
      </section>
    );
  }

  // Home view
  return (
    <>
      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">SOS Brigade Log</p>
          <h1>Kitepop SOS</h1>
          <p>这里沉淀个人生活、SRC 挖掘案例、专业学习和知识点记录。</p>
          <div className="hero-notes">
            <span>Poster-led identity</span>
            <span>Life / SRC / Study / Notes</span>
          </div>
          <div className="hero-actions">
            <button type="button">SOS 发文</button>
            <button className="ghost" onClick={() => setActiveCategory('src')} type="button">
              查看 SRC 复盘
            </button>
          </div>
        </div>
        <div className="hero-visual hero-art" aria-label="blog visual cover">
          <img alt="Haruhi Suzumiya" src={haruhiCutoutImage} />
          <span className="hero-art-ring" aria-hidden="true" />
          <span className="hero-art-corners" aria-hidden="true" />
        </div>
      </section>

      <section className="metrics-strip">
        <span>
          <Icon name="spark" />
          <strong>{publishedCount}</strong> 已发布
        </span>
        <span>
          <Icon name="draft" />
          <strong>{draftCount}</strong> 草稿
        </span>
        <span>
          <Icon name="grid" />
          <strong>{BLOG_CATEGORIES.length}</strong> 内容模块
        </span>
      </section>

      <section className="user-auth-card">
        {userSession ? (
          <>
            <div>
              <strong>{userSession.user.nickname}</strong>
              <span>{userSession.user.permission === 'admin' ? '团长' : '团员'}</span>
            </div>
            <button className="ghost" type="button">
              退出登录
            </button>
          </>
        ) : (
          <form>
            <div className="segmented-control compact-tabs">
              <button
                className={authMode === 'login' ? 'active' : ''}
                onClick={() => setAuthMode('login')}
                type="button"
              >
                登录
              </button>
              <button
                className={authMode === 'register' ? 'active' : ''}
                onClick={() => setAuthMode('register')}
                type="button"
              >
                注册
              </button>
            </div>
            <input
              aria-label="用户名"
              onChange={(event) =>
                setUserForm((current) => ({ ...current, username: event.target.value }))
              }
              placeholder="用户名"
              value={userForm.username}
            />
            <input
              aria-label="密码"
              onChange={(event) =>
                setUserForm((current) => ({ ...current, password: event.target.value }))
              }
              placeholder="密码"
              type="password"
              value={userForm.password}
            />
            {authMode === 'register' ? (
              <input
                aria-label="昵称"
                onChange={(event) =>
                  setUserForm((current) => ({ ...current, nickname: event.target.value }))
                }
                placeholder="昵称"
                value={userForm.nickname}
              />
            ) : null}
            <button type="submit">
              {authMode === 'register' ? '创建账号' : '登录评论'}
            </button>
          </form>
        )}
      </section>

      <section className="home-post-section">
        <div className="home-post-shell">
          <aside className="post-panel home-filter-panel">
            <div className="home-filter-header">
              <div>
                <p className="eyebrow">Index / Filter</p>
                <h2>文章索引</h2>
              </div>
              <span className="filter-total">{indexedPosts.length} 篇</span>
            </div>
            <div className="home-filter-search">
              <input
                aria-label="搜索文章"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、标签、正文"
                value={query}
              />
            </div>
            <div className="index-filters" aria-label="文章索引筛选">
              <FilterMenu
                label="全部时间"
                options={[
                  ['all', '全部时间'],
                  ['7d', '最近 7 天'],
                  ['30d', '最近 30 天'],
                  ['year', '今年']
                ]}
                onSelect={() => {}}
              />
              <FilterMenu
                label={activeCategory === 'all' ? '全部分类' : getCategory(activeCategory).name}
                options={[
                  ['all', '全部分类'],
                  ...BLOG_CATEGORIES.map((category) => [category.id, category.name] as [string, string])
                ]}
                onSelect={(value) => {
                  setActiveCategory(value as BlogCategoryId | 'all');
                }}
              />
            </div>
            <p className="home-filter-hint">
              点击文章页标签可加入筛选，这里会保留当前标签组合。
            </p>
            {activeTags.length > 0 && (
              <div className="tag-filter-group">
                {activeTags.map((tag) => (
                  <button
                    key={tag}
                    className="tag-filter-chip"
                    type="button"
                    onClick={() => toggleActiveTag(tag)}
                  >
                    <Icon name="tag" />
                    {tag}
                    <span aria-hidden="true">&times;</span>
                  </button>
                ))}
                <button
                  className="tag-filter-clear"
                  type="button"
                  onClick={clearTags}
                >
                  清除全部
                </button>
              </div>
            )}
          </aside>
          <section className="post-panel home-post-panel">
            <div className="home-post-header">
              <div>
                <p className="eyebrow">Selected Writing</p>
                <h2>最近文章</h2>
              </div>
              <p>从生活记录到漏洞复盘，按时间与标签继续展开。</p>
            </div>
            <div className="post-list">
              {indexedPosts.map((post: any) => {
                const category = getCategory(post.category);
                const coverImage = getSafeImageUrl(post.coverImage);
                return (
                  <button
                    className="post-item"
                    key={post.id}
                    onClick={() => openPostDetail(post)}
                    type="button"
                  >
                    <span className="post-item-cover">
                      <ImageWithFallback
                        alt=""
                        className="cover-thumb"
                        src={coverImage}
                        fallback={
                          <span className={`cover-dot cover-${post.cover}`}>
                          <Icon name={getCategoryIcon(post.category)} />
                          </span>
                        }
                      />
                    </span>
                    <span className="post-item-copy">
                      <span className="post-item-topline">
                        <em>{category.name}</em>
                        <span>{formatDateTime(post.updatedAt)}</span>
                      </span>
                      <strong>{post.title}</strong>
                      <small>{post.summary}</small>
                      <span className="post-item-footer">
                        <span>
                          <Icon name="clock" />
                          {calculateReadingMinutes(post.content)} 分钟
                        </span>
                        <span>
                          <Icon name="tag" />
                          {post.tags.slice(0, 2).join(' · ') || '未设标签'}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </>
  );
}
