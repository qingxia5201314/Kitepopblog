import { FormEvent, useMemo, useState } from 'react';
import {
  BLOG_CATEGORIES,
  BlogCategoryId,
  BlogPost,
  BlogPostDraft,
  PostStatus,
  calculateReadingMinutes,
  filterPosts,
  getCategory
} from './lib/blog';
import { createBlogRepository } from './lib/blogStore';

type ViewMode = 'home' | 'admin';

const repository = createBlogRepository();

const EMPTY_FORM: BlogPostDraft = {
  title: '',
  summary: '',
  category: 'life',
  tags: [],
  content: '',
  status: 'draft',
  cover: 'life'
};

function splitTags(value: string): string[] {
  return value
    .split(/[,，\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatTags(tags: string[]): string {
  return tags.join('，');
}

function renderMarkdown(content: string) {
  return content.split('\n').map((line, index) => {
    if (line.startsWith('## ')) {
      return <h3 key={index}>{line.slice(3)}</h3>;
    }

    if (line.startsWith('# ')) {
      return <h2 key={index}>{line.slice(2)}</h2>;
    }

    if (line.startsWith('- ')) {
      return <p key={index} className="article-list-line">{line}</p>;
    }

    if (/^\d+\.\s/.test(line)) {
      return <p key={index} className="article-list-line">{line}</p>;
    }

    if (line.trim().startsWith('```')) {
      return <div key={index} className="code-rule" />;
    }

    if (!line.trim()) {
      return <div key={index} className="paragraph-gap" />;
    }

    return <p key={index}>{line}</p>;
  });
}

function App() {
  const [posts, setPosts] = useState<BlogPost[]>(() => repository.list());
  const [mode, setMode] = useState<ViewMode>('home');
  const [activeCategory, setActiveCategory] = useState<BlogCategoryId | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BlogPostDraft>(EMPTY_FORM);

  const visiblePosts = useMemo(
    () => filterPosts(posts, { category: activeCategory, query }),
    [activeCategory, posts, query]
  );
  const selectedPost = posts.find((post) => post.id === selectedPostId) ?? visiblePosts[0];
  const publishedCount = posts.filter((post) => post.status === 'published').length;
  const draftCount = posts.filter((post) => post.status === 'draft').length;

  const refresh = () => setPosts(repository.list());

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const startEdit = (post: BlogPost) => {
    setEditingId(post.id);
    setForm({
      title: post.title,
      summary: post.summary,
      category: post.category,
      tags: post.tags,
      content: post.content,
      status: post.status,
      cover: post.cover
    });
  };

  const savePost = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.title.trim() || !form.summary.trim() || !form.content.trim()) return;

    const payload = {
      ...form,
      cover: form.category
    };

    const saved = editingId ? repository.update(editingId, payload) : repository.create(payload);
    refresh();

    if (saved) {
      setSelectedPostId(saved.id);
      setActiveCategory(saved.category);
      startEdit(saved);
    }
  };

  const removePost = (id: string) => {
    repository.remove(id);
    refresh();
    if (selectedPostId === id) setSelectedPostId(null);
    if (editingId === id) startCreate();
  };

  const updateStatus = (id: string, status: PostStatus) => {
    const updated = repository.update(id, { status });
    refresh();
    if (updated && editingId === id) startEdit(updated);
  };

  const unlockAdmin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password === 'kitepop') {
      setAdminUnlocked(true);
      setPassword('');
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand-button" onClick={() => setMode('home')} type="button">
          <span className="brand-mark">K</span>
          <span>
            <strong>Kitepop</strong>
            <small>life / src / study / notes</small>
          </span>
        </button>
        <nav>
          <button className={mode === 'home' ? 'active' : ''} onClick={() => setMode('home')} type="button">
            阅读
          </button>
          <button className={mode === 'admin' ? 'active' : ''} onClick={() => setMode('admin')} type="button">
            后台
          </button>
        </nav>
      </header>

      {mode === 'home' ? (
        <>
          <section className="hero-band">
            <div className="hero-copy">
              <p className="eyebrow">Kitepop Blog</p>
              <h1>记录生活，也记录每一次专业成长。</h1>
              <p>
                这里沉淀个人生活、SRC 挖掘案例、专业学习和知识点记录。内容可从后台直接发布，适合长期维护。
              </p>
              <div className="hero-actions">
                <button onClick={() => setMode('admin')} type="button">发布文章</button>
                <button className="ghost" onClick={() => setActiveCategory('src')} type="button">查看 SRC 复盘</button>
              </div>
            </div>
            <div className="hero-visual" aria-label="博客内容视觉封面">
              <div className="visual-card visual-life">Life</div>
              <div className="visual-card visual-src">SRC</div>
              <div className="visual-card visual-study">Study</div>
              <div className="visual-card visual-notes">Notes</div>
            </div>
          </section>

          <section className="metrics-strip">
            <span><strong>{publishedCount}</strong> 已发布</span>
            <span><strong>{draftCount}</strong> 草稿</span>
            <span><strong>{BLOG_CATEGORIES.length}</strong> 内容模块</span>
          </section>

          <section className="category-grid" aria-label="内容分类">
            <button className={activeCategory === 'all' ? 'category active' : 'category'} onClick={() => setActiveCategory('all')} type="button">
              <strong>全部内容</strong>
              <span>查看所有已发布文章</span>
            </button>
            {BLOG_CATEGORIES.map((category) => (
              <button
                className={activeCategory === category.id ? 'category active' : 'category'}
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                style={{ '--accent': category.accent } as React.CSSProperties}
                type="button"
              >
                <strong>{category.name}</strong>
                <span>{category.description}</span>
              </button>
            ))}
          </section>

          <section className="content-layout">
            <aside className="post-panel">
              <div className="panel-heading">
                <h2>文章列表</h2>
                <input
                  aria-label="搜索文章"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索标题、标签、正文"
                  value={query}
                />
              </div>
              <div className="post-list">
                {visiblePosts.map((post) => {
                  const category = getCategory(post.category);
                  return (
                    <button
                      className={selectedPost?.id === post.id ? 'post-item active' : 'post-item'}
                      key={post.id}
                      onClick={() => setSelectedPostId(post.id)}
                      type="button"
                    >
                      <span className={`cover-dot cover-${post.cover}`} />
                      <span>
                        <strong>{post.title}</strong>
                        <small>{category.name} · {post.updatedAt} · {calculateReadingMinutes(post.content)} 分钟</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <article className="article-view">
              {selectedPost ? (
                <>
                  <div className={`article-cover cover-${selectedPost.cover}`}>
                    <span>{getCategory(selectedPost.category).name}</span>
                  </div>
                  <p className="eyebrow">{selectedPost.updatedAt} · {calculateReadingMinutes(selectedPost.content)} 分钟阅读</p>
                  <h2>{selectedPost.title}</h2>
                  <p className="summary">{selectedPost.summary}</p>
                  <div className="tag-row">
                    {selectedPost.tags.map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                  <div className="article-body">{renderMarkdown(selectedPost.content)}</div>
                </>
              ) : (
                <div className="empty-state">还没有匹配的文章。</div>
              )}
            </article>
          </section>
        </>
      ) : (
        <section className="admin-layout">
          {!adminUnlocked ? (
            <form className="unlock-panel" onSubmit={unlockAdmin}>
              <p className="eyebrow">Admin</p>
              <h1>后台发布中心</h1>
              <p>输入本地管理口令后，可以新增、编辑、删除文章，并切换草稿和发布状态。</p>
              <input
                aria-label="后台口令"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="默认口令 kitepop"
                type="password"
                value={password}
              />
              <button type="submit">进入后台</button>
            </form>
          ) : (
            <>
              <aside className="admin-list">
                <div className="panel-heading">
                  <h2>内容管理</h2>
                  <button onClick={startCreate} type="button">新建</button>
                </div>
                {posts.map((post) => (
                  <div className="admin-post" key={post.id}>
                    <button onClick={() => startEdit(post)} type="button">
                      <strong>{post.title}</strong>
                      <small>{getCategory(post.category).name} · {post.status === 'published' ? '已发布' : '草稿'}</small>
                    </button>
                    <div>
                      <button onClick={() => updateStatus(post.id, post.status === 'published' ? 'draft' : 'published')} type="button">
                        {post.status === 'published' ? '设草稿' : '发布'}
                      </button>
                      <button className="danger" onClick={() => removePost(post.id)} type="button">删除</button>
                    </div>
                  </div>
                ))}
              </aside>

              <form className="editor-panel" onSubmit={savePost}>
                <div className="panel-heading">
                  <h2>{editingId ? '编辑文章' : '新建文章'}</h2>
                  <button type="submit">{editingId ? '保存更新' : '发布保存'}</button>
                </div>
                <label>
                  标题
                  <input
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                    placeholder="例如：一次越权风险复盘"
                    value={form.title}
                  />
                </label>
                <label>
                  摘要
                  <textarea
                    onChange={(event) => setForm({ ...form, summary: event.target.value })}
                    placeholder="用一两句话说明这篇文章的价值"
                    rows={3}
                    value={form.summary}
                  />
                </label>
                <div className="form-grid">
                  <label>
                    分类
                    <select
                      onChange={(event) => setForm({ ...form, category: event.target.value as BlogCategoryId, cover: event.target.value as BlogCategoryId })}
                      value={form.category}
                    >
                      {BLOG_CATEGORIES.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    状态
                    <select
                      onChange={(event) => setForm({ ...form, status: event.target.value as PostStatus })}
                      value={form.status}
                    >
                      <option value="draft">草稿</option>
                      <option value="published">发布</option>
                    </select>
                  </label>
                </div>
                <label>
                  标签
                  <input
                    onChange={(event) => setForm({ ...form, tags: splitTags(event.target.value) })}
                    placeholder="用逗号或空格分隔"
                    value={formatTags(form.tags)}
                  />
                </label>
                <label>
                  正文
                  <textarea
                    className="content-editor"
                    onChange={(event) => setForm({ ...form, content: event.target.value })}
                    placeholder="支持简单 Markdown：# 标题、## 小节、- 列表"
                    rows={16}
                    value={form.content}
                  />
                </label>
              </form>
            </>
          )}
        </section>
      )}
    </main>
  );
}

export default App;
