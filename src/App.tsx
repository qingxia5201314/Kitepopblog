import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  BLOG_CATEGORIES,
  BlogCategoryId,
  BlogPost,
  BlogPostDraft,
  PostStatus,
  calculateReadingMinutes,
  filterPosts,
  getCategory,
  getCategoryIcon
} from './lib/blog';
import { createPost, deletePost, listPosts, updatePost } from './lib/blogApi';
import {
  ACCOUNTING_CATEGORIES,
  AccountingCategoryId,
  AccountingEntry,
  AccountingEntryDraft,
  AccountingEntryType,
  AccountingMonthData,
  AccountingSettingsDraft,
  currentMonthInput,
  formatMoney,
  getAccountingCategory,
  todayDateInput
} from './lib/accounting';
import {
  createAccountingEntry,
  deleteAccountingEntry,
  getAccountingMonth,
  loginAccounting,
  updateAccountingEntry,
  updateAccountingSettings
} from './lib/accountingApi';
import { createDraftAutosaveRepository } from './lib/draftAutosave';
import { normalizeImageUrl } from './lib/imageUrl';
import { MarkdownBlock, parseMarkdown } from './lib/markdown';
import { AppNotification, NotificationType, createNotification } from './lib/notification';

type ViewMode = 'home' | 'accounting' | 'admin';
type EditorTab = 'edit' | 'preview';
type AdminStatusFilter = 'all' | PostStatus;
type AccountingTypeFilter = 'all' | AccountingEntryType;
type AccountingCategoryFilter = 'all' | AccountingCategoryId;
type UiIcon = ReturnType<typeof getCategoryIcon> | 'calendar' | 'clock' | 'tag' | 'spark' | 'grid' | 'draft' | 'edit';

const safeImageAttributes = {
  decoding: 'async',
  loading: 'lazy',
  referrerPolicy: 'no-referrer'
} as const;

const draftRepository = createDraftAutosaveRepository();
const ACCOUNTING_SESSION_KEY = 'kitepop-accounting-session';

const EMPTY_FORM: BlogPostDraft = {
  title: '',
  summary: '',
  category: 'life',
  tags: [],
  content: '',
  status: 'draft',
  cover: 'life',
  coverImage: ''
};

const EMPTY_ACCOUNTING_ENTRY: AccountingEntryDraft = {
  type: 'expense',
  amountYuan: '',
  category: 'food',
  account: '支付宝',
  spentAt: todayDateInput(),
  note: ''
};

const EMPTY_ACCOUNTING_SETTINGS: AccountingSettingsDraft = {
  monthlyBudgetYuan: '',
  savingGoal: {
    name: '本月存钱目标',
    targetYuan: '',
    savedYuan: '',
    startDate: `${currentMonthInput()}-01`,
    endDate: `${currentMonthInput()}-30`
  }
};

function loadAccountingSession(): { token: string; expiresAt: string } | null {
  try {
    const raw = window.localStorage.getItem(ACCOUNTING_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string; expiresAt?: string };
    if (!parsed.token || !parsed.expiresAt || Date.parse(parsed.expiresAt) <= Date.now()) {
      window.localStorage.removeItem(ACCOUNTING_SESSION_KEY);
      return null;
    }
    return { token: parsed.token, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function saveAccountingSession(session: { token: string; expiresAt: string }) {
  window.localStorage.setItem(ACCOUNTING_SESSION_KEY, JSON.stringify(session));
}

function clearAccountingSession() {
  window.localStorage.removeItem(ACCOUNTING_SESSION_KEY);
}

function centsToInput(cents = 0): string {
  return cents > 0 ? String(cents / 100) : '';
}

function splitTags(value: string): string[] {
  return value
    .split(/[,，\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatTags(tags: string[]): string {
  return tags.join('，');
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+]\(https?:\/\/[^)]+\))/g);

  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }

    const linkMatch = part.match(/^\[([^\]]+)]\((https?:\/\/[^)]+)\)$/);
    if (linkMatch) {
      return (
        <a href={linkMatch[2]} key={index} rel="noreferrer" target="_blank">
          {linkMatch[1]}
        </a>
      );
    }

    return part;
  });
}

function renderMarkdownBlock(block: MarkdownBlock, index: number) {
  if (block.type === 'heading') {
    const content = renderInlineMarkdown(block.text);
    if (block.level === 1) return <h2 key={index}>{content}</h2>;
    if (block.level === 2) return <h3 key={index}>{content}</h3>;
    return <h4 key={index}>{content}</h4>;
  }

  if (block.type === 'paragraph') {
    return <p key={index}>{renderInlineMarkdown(block.text)}</p>;
  }

  if (block.type === 'blockquote') {
    return <blockquote key={index}>{renderInlineMarkdown(block.text)}</blockquote>;
  }

  if (block.type === 'list') {
    const Tag = block.ordered ? 'ol' : 'ul';
    return (
      <Tag className="article-md-list" key={index}>
        {block.items.map((item) => (
          <li key={item}>{renderInlineMarkdown(item)}</li>
        ))}
      </Tag>
    );
  }

  if (block.type === 'code') {
    return (
      <pre className="article-code" key={index}>
        {block.language ? <span>{block.language}</span> : null}
        <code>{block.code}</code>
      </pre>
    );
  }

  const imageUrl = normalizeImageUrl(block.url);
  if (!imageUrl) return null;

  return (
    <figure className="article-image" key={index}>
      <img alt={block.alt || '文章图片'} src={imageUrl} {...safeImageAttributes} />
      {block.alt ? <figcaption>{block.alt}</figcaption> : null}
    </figure>
  );
}

function renderMarkdown(content: string) {
  return parseMarkdown(content).map(renderMarkdownBlock);
}

function getSafeImageUrl(value?: string): string | undefined {
  return value ? normalizeImageUrl(value) : undefined;
}

function Icon({ className = '', name }: { className?: string; name: UiIcon }) {
  return <span aria-hidden="true" className={`ui-icon icon-${name} ${className}`} />;
}

function App() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [mode, setMode] = useState<ViewMode>('home');
  const [activeCategory, setActiveCategory] = useState<BlogCategoryId | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminToken, setAdminToken] = useState('');
  const [password, setPassword] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BlogPostDraft>(() => draftRepository.load() ?? EMPTY_FORM);
  const [editorTab, setEditorTab] = useState<EditorTab>('edit');
  const [adminStatusFilter, setAdminStatusFilter] = useState<AdminStatusFilter>('all');
  const [notification, setNotification] = useState<AppNotification | null>(null);
  const [autosaveNote, setAutosaveNote] = useState('');
  const [accountingSession, setAccountingSession] = useState(() => loadAccountingSession());
  const [accountingPassword, setAccountingPassword] = useState('');
  const [accountingMonth, setAccountingMonth] = useState(currentMonthInput());
  const [accountingTypeFilter, setAccountingTypeFilter] = useState<AccountingTypeFilter>('all');
  const [accountingCategoryFilter, setAccountingCategoryFilter] = useState<AccountingCategoryFilter>('all');
  const [accountingData, setAccountingData] = useState<AccountingMonthData | null>(null);
  const [accountingForm, setAccountingForm] = useState<AccountingEntryDraft>(EMPTY_ACCOUNTING_ENTRY);
  const [editingAccountingId, setEditingAccountingId] = useState<string | null>(null);
  const [accountingSettingsForm, setAccountingSettingsForm] =
    useState<AccountingSettingsDraft>(EMPTY_ACCOUNTING_SETTINGS);

  const visiblePosts = useMemo(
    () => filterPosts(posts, { category: activeCategory, query }),
    [activeCategory, posts, query]
  );
  const selectedPost = posts.find((post) => post.id === selectedPostId) ?? visiblePosts[0];
  const selectedCoverImage = getSafeImageUrl(selectedPost?.coverImage);
  const publishedCount = posts.filter((post) => post.status === 'published').length;
  const draftCount = posts.filter((post) => post.status === 'draft').length;
  const adminPosts = posts.filter((post) => adminStatusFilter === 'all' || post.status === adminStatusFilter);
  const formCoverImage = getSafeImageUrl(form.coverImage);
  const accountingToken = accountingSession?.token ?? '';
  const accountingCategories = ACCOUNTING_CATEGORIES.filter(
    (category) => category.type === 'both' || category.type === accountingForm.type
  );

  useEffect(() => {
    if (!adminUnlocked || editingId) return;

    const hasDraftContent =
      form.title.trim() || form.summary.trim() || form.content.trim() || form.tags.length > 0 || form.coverImage;

    if (hasDraftContent) {
      draftRepository.save(form);
      setAutosaveNote('草稿已自动保存到本地浏览器');
    }
  }, [adminUnlocked, editingId, form]);

  useEffect(() => {
    if (!notification) return;

    const timer = window.setTimeout(() => {
      setNotification((current) => (current?.id === notification.id ? null : current));
    }, notification.durationMs);

    return () => window.clearTimeout(timer);
  }, [notification]);

  const notify = (type: NotificationType, message: string, durationMs?: number) => {
    setNotification(createNotification(type, message, durationMs));
  };

  const loadPosts = async (includeDrafts = adminUnlocked, token = adminToken) => {
    try {
      const nextPosts = await listPosts({ includeDrafts, token });
      setPosts(nextPosts);
    } catch {
      notify('error', '文章加载失败，请稍后重试');
    }
  };

  const syncAccountingSettingsForm = (data: AccountingMonthData) => {
    setAccountingSettingsForm({
      monthlyBudgetYuan: centsToInput(data.settings.monthlyBudgetCents),
      savingGoal: data.savingGoal
        ? {
            name: data.savingGoal.name,
            targetYuan: centsToInput(data.savingGoal.targetCents),
            savedYuan: centsToInput(data.savingGoal.savedCents),
            startDate: data.savingGoal.startDate,
            endDate: data.savingGoal.endDate
          }
        : EMPTY_ACCOUNTING_SETTINGS.savingGoal
    });
  };

  const expireAccountingSession = () => {
    clearAccountingSession();
    setAccountingSession(null);
    setAccountingData(null);
    notify('error', '记账登录已过期，请重新登录');
  };

  const loadAccountingData = async (
    token = accountingToken,
    month = accountingMonth,
    type = accountingTypeFilter,
    category = accountingCategoryFilter
  ) => {
    if (!token) return;
    try {
      const data = await getAccountingMonth({ token, month, type, category });
      setAccountingData(data);
      syncAccountingSettingsForm(data);
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('session')) {
        expireAccountingSession();
        return;
      }
      notify('error', error instanceof Error ? error.message : '记账数据加载失败');
    }
  };

  useEffect(() => {
    void loadPosts(false, '');
  }, []);

  useEffect(() => {
    if (accountingToken) {
      void loadAccountingData(accountingToken, accountingMonth, accountingTypeFilter, accountingCategoryFilter);
    }
  }, [accountingToken, accountingMonth, accountingTypeFilter, accountingCategoryFilter]);

  const updateForm = (patch: Partial<BlogPostDraft>) => {
    setForm((current) => ({ ...current, ...patch }));
    setNotification((current) => (current?.type === 'error' ? null : current));
  };

  const startCreate = () => {
    setEditingId(null);
    setForm(draftRepository.load() ?? EMPTY_FORM);
    setEditorTab('edit');
    notify('info', '已进入新建文章模式');
  };

  const startEdit = (post: BlogPost, showNotice = true) => {
    setEditingId(post.id);
    setForm({
      title: post.title,
      summary: post.summary,
      category: post.category,
      tags: post.tags,
      content: post.content,
      status: post.status,
      cover: post.cover,
      coverImage: post.coverImage ?? ''
    });
    setEditorTab('edit');
    if (showNotice) notify('info', `正在编辑：${post.title}`);
  };

  const savePost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.title.trim()) {
      notify('error', '请填写文章标题');
      return;
    }

    if (!form.summary.trim()) {
      notify('error', '请填写文章摘要');
      return;
    }

    if (!form.content.trim()) {
      notify('error', '请填写文章正文');
      return;
    }

    const coverImageInput = form.coverImage?.trim() ?? '';
    const coverImage = coverImageInput ? normalizeImageUrl(coverImageInput) : '';

    if (coverImageInput && !coverImage) {
      notify('error', '请输入 HTTPS 封面图片 URL（本地调试允许 localhost HTTP）');
      return;
    }

    const payload = {
      ...form,
      cover: form.category,
      coverImage
    };

    try {
      const saved = editingId ? await updatePost(editingId, payload, adminToken) : await createPost(payload, adminToken);
      await loadPosts(true, adminToken);
      setSelectedPostId(saved.id);
      setActiveCategory(saved.category);
      notify('success', saved.status === 'published' ? '文章已保存并发布' : '文章已保存为草稿');
      draftRepository.clear();
      startEdit(saved, false);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文章保存失败');
    }
  };

  const removePost = async (post: BlogPost) => {
    const confirmed = window.confirm(`确认删除《${post.title}》吗？这个操作不能撤销。`);
    if (!confirmed) return;

    try {
      await deletePost(post.id, adminToken);
      await loadPosts(true, adminToken);
      notify('success', '文章已删除');
      if (selectedPostId === post.id) setSelectedPostId(null);
      if (editingId === post.id) startCreate();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文章删除失败');
    }
  };

  const updateStatus = async (id: string, status: PostStatus) => {
    try {
      const updated = await updatePost(id, { status }, adminToken);
      await loadPosts(true, adminToken);
      if (updated && editingId === id) startEdit(updated, false);
      notify('success', status === 'published' ? '文章已发布' : '文章已转为草稿');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '状态更新失败');
    }
  };

  const unlockAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ password })
      });
      const result = (await response.json()) as { ok?: boolean; message?: string; token?: string };

      if (!response.ok || !result.ok || !result.token) {
        notify('error', result.message || '后台口令不正确');
        return;
      }

      setAdminUnlocked(true);
      setAdminToken(result.token);
      setPassword('');
      await loadPosts(true, result.token);
      notify('success', '已进入后台');
    } catch {
      notify('error', '无法连接后台登录接口');
    }
  };

  const insertMarkdownSnippet = (before: string, after = '', placeholder = '内容') => {
    const snippet = `${before}${placeholder}${after}`;
    const nextContent = form.content.trim() ? `${form.content}\n\n${snippet}` : snippet;
    updateForm({ content: nextContent });
    notify('info', 'Markdown 片段已插入正文');
  };

  const unlockAccounting = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const session = await loginAccounting(accountingPassword);
      saveAccountingSession(session);
      setAccountingSession(session);
      setAccountingPassword('');
      await loadAccountingData(session.token);
      notify('success', '记账会话已保持 30 天');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '记账口令不正确');
    }
  };

  const logoutAccounting = () => {
    clearAccountingSession();
    setAccountingSession(null);
    setAccountingData(null);
    notify('info', '已退出记账');
  };

  const updateAccountingForm = (patch: Partial<AccountingEntryDraft>) => {
    setAccountingForm((current) => ({ ...current, ...patch }));
    setNotification((current) => (current?.type === 'error' ? null : current));
  };

  const resetAccountingForm = () => {
    setEditingAccountingId(null);
    setAccountingForm({ ...EMPTY_ACCOUNTING_ENTRY, spentAt: todayDateInput() });
  };

  const startEditAccountingEntry = (entry: AccountingEntry) => {
    setEditingAccountingId(entry.id);
    setAccountingForm({
      type: entry.type,
      amountYuan: centsToInput(entry.amountCents),
      category: entry.category,
      account: entry.account,
      spentAt: entry.spentAt,
      note: entry.note
    });
  };

  const saveAccountingEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accountingToken) return;
    if (!accountingForm.amountYuan.trim()) {
      notify('error', '请填写金额');
      return;
    }
    if (!accountingForm.account.trim()) {
      notify('error', '请填写账户');
      return;
    }

    try {
      if (editingAccountingId) {
        await updateAccountingEntry(editingAccountingId, accountingForm, accountingToken);
      } else {
        await createAccountingEntry(accountingForm, accountingToken);
      }
      resetAccountingForm();
      await loadAccountingData();
      notify('success', editingAccountingId ? '流水已更新' : '流水已保存');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '流水保存失败');
    }
  };

  const removeAccountingEntry = async (entry: AccountingEntry) => {
    if (!accountingToken) return;
    const confirmed = window.confirm(`确认删除这笔 ${formatMoney(entry.amountCents)} 的流水吗？`);
    if (!confirmed) return;

    try {
      await deleteAccountingEntry(entry.id, accountingToken);
      await loadAccountingData();
      notify('success', '流水已删除');
      if (editingAccountingId === entry.id) resetAccountingForm();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '流水删除失败');
    }
  };

  const saveAccountingSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accountingToken) return;

    try {
      await updateAccountingSettings(accountingSettingsForm, accountingToken);
      await loadAccountingData();
      notify('success', '预算和存钱目标已保存');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '设置保存失败');
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
          <span className="brand-status" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
        <nav>
          <button className={mode === 'home' ? 'active' : ''} onClick={() => setMode('home')} type="button">
            阅读
          </button>
          <button className={mode === 'accounting' ? 'active' : ''} onClick={() => setMode('accounting')} type="button">
            记账
          </button>
          <button className={mode === 'admin' ? 'active' : ''} onClick={() => setMode('admin')} type="button">
            后台
          </button>
        </nav>
      </header>

      {notification ? (
        <div
          className={`toast toast-${notification.type}`}
          key={notification.id}
          role="alert"
          style={{ '--toast-duration': `${notification.durationMs}ms` } as React.CSSProperties}
        >
          <span>{notification.message}</span>
          <button aria-label="关闭提示" onClick={() => setNotification(null)} type="button">×</button>
        </div>
      ) : null}

      {mode === 'home' ? (
        <>
          <section className="hero-band">
            <div className="hero-copy">
              <p className="eyebrow">Kitepop Blog</p>
              <h1>记录生活，也记录每一次专业成长。</h1>
              <p>
                这里沉淀个人生活、SRC 挖掘案例、专业学习和知识点记录。后台支持 Markdown、封面图和图文发布。
              </p>
              <div className="hero-actions">
                <button onClick={() => setMode('admin')} type="button">发布文章</button>
                <button className="ghost" onClick={() => setActiveCategory('src')} type="button">查看 SRC 复盘</button>
              </div>
            </div>
            <div className="hero-visual" aria-label="博客内容视觉封面">
              <div className="visual-card visual-life"><Icon name="sun" />Life</div>
              <div className="visual-card visual-src"><Icon name="shield" />SRC</div>
              <div className="visual-card visual-study"><Icon name="book" />Study</div>
              <div className="visual-card visual-notes"><Icon name="hash" />Notes</div>
            </div>
          </section>

          <section className="metrics-strip">
            <span><Icon name="spark" /><strong>{publishedCount}</strong> 已发布</span>
            <span><Icon name="draft" /><strong>{draftCount}</strong> 草稿</span>
            <span><Icon name="grid" /><strong>{BLOG_CATEGORIES.length}</strong> 内容模块</span>
          </section>

          <section className="category-grid" aria-label="内容分类">
            <button className={activeCategory === 'all' ? 'category active' : 'category'} onClick={() => setActiveCategory('all')} type="button">
              <Icon name="grid" className="category-icon" />
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
                <Icon name={getCategoryIcon(category.id)} className="category-icon" />
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
                  const coverImage = getSafeImageUrl(post.coverImage);
                  return (
                    <button
                      className={selectedPost?.id === post.id ? 'post-item active' : 'post-item'}
                      key={post.id}
                      onClick={() => setSelectedPostId(post.id)}
                      type="button"
                    >
                      {coverImage ? (
                        <img alt="" className="cover-thumb" src={coverImage} {...safeImageAttributes} />
                      ) : (
                        <span className={`cover-dot cover-${post.cover}`}>
                          <Icon name={getCategoryIcon(post.category)} />
                        </span>
                      )}
                      <span>
                        <strong>{post.title}</strong>
                        <small>
                          <Icon name={getCategoryIcon(post.category)} />
                          {category.name}
                          <Icon name="calendar" />
                          {post.updatedAt}
                          <Icon name="clock" />
                          {calculateReadingMinutes(post.content)} 分钟
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <article className="article-view">
              {selectedPost ? (
                <>
                  {selectedCoverImage ? (
                    <img alt={selectedPost.title} className="article-cover-image" src={selectedCoverImage} {...safeImageAttributes} />
                  ) : (
                    <div className={`article-cover cover-${selectedPost.cover}`}>
                      <span>
                        <Icon name={getCategoryIcon(selectedPost.category)} />
                        {getCategory(selectedPost.category).name}
                      </span>
                    </div>
                  )}
                  <p className="article-meta">
                    <span><Icon name="calendar" />{selectedPost.updatedAt}</span>
                    <span><Icon name="clock" />{calculateReadingMinutes(selectedPost.content)} 分钟阅读</span>
                    <span><Icon name={getCategoryIcon(selectedPost.category)} />{getCategory(selectedPost.category).name}</span>
                  </p>
                  <h2>{selectedPost.title}</h2>
                  <p className="summary">{selectedPost.summary}</p>
                  <div className="tag-row">
                    {selectedPost.tags.map((tag) => <span key={tag}><Icon name="tag" />{tag}</span>)}
                  </div>
                  <div className="article-body">{renderMarkdown(selectedPost.content)}</div>
                </>
              ) : (
                <div className="empty-state">还没有匹配的文章。</div>
              )}
            </article>
          </section>
        </>
      ) : mode === 'accounting' ? (
        <section className="accounting-page">
          {!accountingSession ? (
            <form className="unlock-panel" onSubmit={unlockAccounting}>
              <p className="eyebrow">Private Ledger</p>
              <h1>记账中心</h1>
              <p>输入管理口令后，可以查看和维护个人流水、月预算和一个月存钱目标。未登录用户不会看到任何金额数据。</p>
              <input
                aria-label="记账口令"
                onChange={(event) => setAccountingPassword(event.target.value)}
                placeholder="输入记账口令"
                type="password"
                value={accountingPassword}
              />
              <button type="submit">进入记账</button>
            </form>
          ) : (
            <>
              <section className="accounting-hero">
                <div>
                  <p className="eyebrow">Private Ledger</p>
                  <h1>本月收支和存钱目标</h1>
                  <p>会话已保持到 {new Date(accountingSession.expiresAt).toLocaleDateString('zh-CN')}，数据只从服务端读取。</p>
                </div>
                <div className="accounting-actions">
                  <input
                    aria-label="选择月份"
                    onChange={(event) => setAccountingMonth(event.target.value)}
                    type="month"
                    value={accountingMonth}
                  />
                  <button className="ghost" onClick={logoutAccounting} type="button">退出记账</button>
                </div>
              </section>

              <section className="accounting-metrics">
                <div>
                  <span>本月收入</span>
                  <strong>{formatMoney(accountingData?.summary.incomeCents ?? 0)}</strong>
                </div>
                <div>
                  <span>本月支出</span>
                  <strong>{formatMoney(accountingData?.summary.expenseCents ?? 0)}</strong>
                </div>
                <div>
                  <span>结余</span>
                  <strong>{formatMoney(accountingData?.summary.balanceCents ?? 0)}</strong>
                </div>
                <div>
                  <span>预算剩余</span>
                  <strong>{formatMoney(accountingData?.summary.budgetRemainingCents ?? 0)}</strong>
                </div>
              </section>

              <section className="accounting-layout">
                <form className="accounting-card accounting-form" onSubmit={saveAccountingEntry}>
                  <div className="panel-heading">
                    <h2>{editingAccountingId ? '编辑流水' : '快速记一笔'}</h2>
                    {editingAccountingId ? <button onClick={resetAccountingForm} type="button">取消编辑</button> : null}
                  </div>
                  <div className="segmented-control">
                    {(['expense', 'income'] as AccountingEntryType[]).map((type) => (
                      <button
                        className={accountingForm.type === type ? 'active' : ''}
                        key={type}
                        onClick={() =>
                          updateAccountingForm({
                            type,
                            category: type === 'income' ? 'salary' : 'food'
                          })
                        }
                        type="button"
                      >
                        {type === 'expense' ? '支出' : '收入'}
                      </button>
                    ))}
                  </div>
                  <div className="form-grid">
                    <label>
                      金额
                      <input
                        inputMode="decimal"
                        onChange={(event) => updateAccountingForm({ amountYuan: event.target.value })}
                        placeholder="0.00"
                        value={accountingForm.amountYuan}
                      />
                    </label>
                    <label>
                      分类
                      <select
                        onChange={(event) => updateAccountingForm({ category: event.target.value as AccountingCategoryId })}
                        value={accountingForm.category}
                      >
                        {accountingCategories.map((category) => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="form-grid">
                    <label>
                      日期
                      <input
                        onChange={(event) => updateAccountingForm({ spentAt: event.target.value })}
                        type="date"
                        value={accountingForm.spentAt}
                      />
                    </label>
                    <label>
                      账户
                      <input
                        onChange={(event) => updateAccountingForm({ account: event.target.value })}
                        placeholder="支付宝 / 微信 / 银行卡"
                        value={accountingForm.account}
                      />
                    </label>
                  </div>
                  <label>
                    备注
                    <input
                      onChange={(event) => updateAccountingForm({ note: event.target.value })}
                      placeholder="例如：午饭、课程、工资"
                      value={accountingForm.note}
                    />
                  </label>
                  <button type="submit">{editingAccountingId ? '保存更新' : '保存流水'}</button>
                </form>

                <section className="accounting-card">
                  <div className="panel-heading">
                    <h2>流水筛选</h2>
                  </div>
                  <div className="form-grid">
                    <label>
                      类型
                      <select
                        onChange={(event) => setAccountingTypeFilter(event.target.value as AccountingTypeFilter)}
                        value={accountingTypeFilter}
                      >
                        <option value="all">全部</option>
                        <option value="expense">支出</option>
                        <option value="income">收入</option>
                      </select>
                    </label>
                    <label>
                      分类
                      <select
                        onChange={(event) => setAccountingCategoryFilter(event.target.value as AccountingCategoryFilter)}
                        value={accountingCategoryFilter}
                      >
                        <option value="all">全部分类</option>
                        {ACCOUNTING_CATEGORIES.map((category) => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="entry-list">
                    {(accountingData?.entries ?? []).map((entry) => {
                      const category = getAccountingCategory(entry.category);
                      return (
                        <div className="entry-item" key={entry.id}>
                          <span className={`entry-type entry-${entry.type}`}>{entry.type === 'expense' ? '支' : '收'}</span>
                          <span>
                            <strong>{category.name} · {entry.account}</strong>
                            <small>{entry.spentAt}{entry.note ? ` · ${entry.note}` : ''}</small>
                          </span>
                          <strong className={entry.type === 'expense' ? 'money-expense' : 'money-income'}>
                            {entry.type === 'expense' ? '-' : '+'}{formatMoney(entry.amountCents)}
                          </strong>
                          <button onClick={() => startEditAccountingEntry(entry)} type="button">编辑</button>
                          <button className="danger" onClick={() => removeAccountingEntry(entry)} type="button">删除</button>
                        </div>
                      );
                    })}
                    {accountingData && accountingData.entries.length === 0 ? (
                      <div className="empty-state">这个筛选条件下还没有流水。</div>
                    ) : null}
                  </div>
                </section>

                <form className="accounting-card saving-panel" onSubmit={saveAccountingSettings}>
                  <div className="panel-heading">
                    <h2>预算和存钱目标</h2>
                    <button type="submit">保存设置</button>
                  </div>
                  <label>
                    月预算
                    <input
                      inputMode="decimal"
                      onChange={(event) =>
                        setAccountingSettingsForm((current) => ({ ...current, monthlyBudgetYuan: event.target.value }))
                      }
                      placeholder="例如：3000"
                      value={accountingSettingsForm.monthlyBudgetYuan}
                    />
                  </label>
                  <div className="progress-track">
                    <span style={{ width: `${Math.min(accountingData?.summary.budgetUsedPercent ?? 0, 100)}%` }} />
                  </div>
                  <p>预算已用 {accountingData?.summary.budgetUsedPercent ?? 0}%</p>
                  {accountingSettingsForm.savingGoal ? (
                    <>
                      <div className="form-grid">
                        <label>
                          目标名称
                          <input
                            onChange={(event) =>
                              setAccountingSettingsForm((current) => ({
                                ...current,
                                savingGoal: { ...current.savingGoal!, name: event.target.value }
                              }))
                            }
                            value={accountingSettingsForm.savingGoal.name}
                          />
                        </label>
                        <label>
                          目标金额
                          <input
                            inputMode="decimal"
                            onChange={(event) =>
                              setAccountingSettingsForm((current) => ({
                                ...current,
                                savingGoal: { ...current.savingGoal!, targetYuan: event.target.value }
                              }))
                            }
                            placeholder="5000"
                            value={accountingSettingsForm.savingGoal.targetYuan}
                          />
                        </label>
                      </div>
                      <div className="form-grid">
                        <label>
                          已存金额
                          <input
                            inputMode="decimal"
                            onChange={(event) =>
                              setAccountingSettingsForm((current) => ({
                                ...current,
                                savingGoal: { ...current.savingGoal!, savedYuan: event.target.value }
                              }))
                            }
                            placeholder="1200"
                            value={accountingSettingsForm.savingGoal.savedYuan}
                          />
                        </label>
                        <label>
                          结束日期
                          <input
                            onChange={(event) =>
                              setAccountingSettingsForm((current) => ({
                                ...current,
                                savingGoal: { ...current.savingGoal!, endDate: event.target.value }
                              }))
                            }
                            type="date"
                            value={accountingSettingsForm.savingGoal.endDate}
                          />
                        </label>
                      </div>
                    </>
                  ) : null}
                  <div className="saving-summary">
                    <strong>{accountingData?.savingGoal?.progressPercent ?? 0}%</strong>
                    <span>还需 {formatMoney(accountingData?.savingGoal?.remainingCents ?? 0)}</span>
                    <span>建议每天存 {formatMoney(accountingData?.savingGoal?.dailyRequiredCents ?? 0)}</span>
                  </div>
                </form>
              </section>
            </>
          )}
        </section>
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
                placeholder="输入后台口令"
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
                <div className="segmented-control">
                  {(['all', 'published', 'draft'] as AdminStatusFilter[]).map((status) => (
                    <button
                      className={adminStatusFilter === status ? 'active' : ''}
                      key={status}
                      onClick={() => setAdminStatusFilter(status)}
                      type="button"
                    >
                      {status === 'all' ? '全部' : status === 'published' ? '已发布' : '草稿'}
                    </button>
                  ))}
                </div>
                {adminPosts.map((post) => (
                  <div className="admin-post" key={post.id}>
                    <button onClick={() => startEdit(post)} type="button">
                      <strong>{post.title}</strong>
                      <small>{getCategory(post.category).name} · {post.status === 'published' ? '已发布' : '草稿'}</small>
                    </button>
                    <div>
                      <button onClick={() => updateStatus(post.id, post.status === 'published' ? 'draft' : 'published')} type="button">
                        {post.status === 'published' ? '设草稿' : '发布'}
                      </button>
                      <button className="danger" onClick={() => removePost(post)} type="button">删除</button>
                    </div>
                  </div>
                ))}
              </aside>

              <form className="editor-panel" onSubmit={savePost}>
                <div className="panel-heading">
                  <h2>{editingId ? '编辑文章' : '新建文章'}</h2>
                  <button type="submit">{editingId ? '保存更新' : '保存文章'}</button>
                </div>
                {autosaveNote ? <p className="autosave-note">{autosaveNote}</p> : null}

                <label>
                  标题
                  <input
                    onChange={(event) => updateForm({ title: event.target.value })}
                    placeholder="例如：一次越权风险复盘"
                    value={form.title}
                  />
                </label>
                <label>
                  摘要
                  <textarea
                    onChange={(event) => updateForm({ summary: event.target.value })}
                    placeholder="用一两句话说明这篇文章的价值"
                    rows={3}
                    value={form.summary}
                  />
                </label>
                <div className="form-grid">
                  <label>
                    分类
                    <select
                      onChange={(event) => updateForm({ category: event.target.value as BlogCategoryId, cover: event.target.value as BlogCategoryId })}
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
                      onChange={(event) => updateForm({ status: event.target.value as PostStatus })}
                      value={form.status}
                    >
                      <option value="draft">草稿</option>
                      <option value="published">发布</option>
                    </select>
                  </label>
                </div>
                <label>
                  封面图 URL
                  <input
                    onChange={(event) => updateForm({ coverImage: event.target.value })}
                    placeholder="请输入 HTTPS 图片 URL"
                    value={form.coverImage ?? ''}
                  />
                </label>
                <label>
                  标签
                  <input
                    onChange={(event) => updateForm({ tags: splitTags(event.target.value) })}
                    placeholder="用逗号或空格分隔"
                    value={formatTags(form.tags)}
                  />
                </label>
                <div className="segmented-control editor-tabs">
                  <button className={editorTab === 'edit' ? 'active' : ''} onClick={() => setEditorTab('edit')} type="button">
                    编辑
                  </button>
                  <button className={editorTab === 'preview' ? 'active' : ''} onClick={() => setEditorTab('preview')} type="button">
                    预览
                  </button>
                </div>
                {editorTab === 'edit' ? (
                  <section className="markdown-editor">
                    <div className="markdown-toolbar" aria-label="Markdown 工具栏">
                      <button aria-label="一级标题" onClick={() => insertMarkdownSnippet('# ')} title="一级标题" type="button">H1</button>
                      <button aria-label="二级标题" onClick={() => insertMarkdownSnippet('## ')} title="二级标题" type="button">H2</button>
                      <button aria-label="粗体" onClick={() => insertMarkdownSnippet('**', '**')} title="粗体" type="button">B</button>
                      <button aria-label="行内代码" onClick={() => insertMarkdownSnippet('`', '`', 'code')} title="行内代码" type="button">&lt;/&gt;</button>
                      <button aria-label="引用" onClick={() => insertMarkdownSnippet('> ')} title="引用" type="button">“”</button>
                      <button aria-label="列表" onClick={() => insertMarkdownSnippet('- ')} title="列表" type="button">•</button>
                      <button aria-label="链接" onClick={() => insertMarkdownSnippet('[', '](https://example.com)', '链接文字')} title="链接" type="button">↗</button>
                      <button aria-label="代码块" onClick={() => insertMarkdownSnippet('```bash\n', '\n```', 'npm run build')} title="代码块" type="button">▣</button>
                    </div>
                    <label>
                      正文
                      <textarea
                        className="content-editor"
                        onChange={(event) => updateForm({ content: event.target.value })}
                        placeholder="支持 Markdown：标题、粗体、行内代码、链接、引用、列表、代码块、图片。"
                        rows={16}
                        value={form.content}
                      />
                    </label>
                  </section>
                ) : (
                  <div className="editor-preview">
                    {formCoverImage ? (
                      <img alt={form.title || '封面图'} className="article-cover-image" src={formCoverImage} {...safeImageAttributes} />
                    ) : null}
                    <h2>{form.title || '未命名文章'}</h2>
                    <p className="summary">{form.summary || '这里会显示文章摘要。'}</p>
                    <div className="article-body">{renderMarkdown(form.content || '正文预览会显示在这里。')}</div>
                  </div>
                )}
              </form>
            </>
          )}
        </section>
      )}
    </main>
  );
}

export default App;
