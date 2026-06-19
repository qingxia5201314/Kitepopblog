import { ClipboardEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  BLOG_CATEGORIES,
  BlogCategoryId,
  BlogPost,
  BlogPostDraft,
  BlogUser,
  PostComment,
  PostStatus,
  UserSession,
  calculateReadingMinutes,
  filterPosts,
  getCategory,
  getCategoryIcon
} from './lib/blog';
import {
  createPost,
  createPostComment,
  createUser,
  deletePostComment,
  deletePost,
  deleteUser,
  getCurrentUser,
  listPostComments,
  listPosts,
  listUsers,
  loginUser,
  registerUser,
  updatePostComment,
  updatePost,
  updateUser
} from './lib/blogApi';
import {
  ACCOUNTING_CATEGORIES,
  ACCOUNTING_ENTRY_COLLAPSE_LIMIT,
  ACCOUNTING_PAYMENT_METHODS,
  AccountingCategory,
  AccountingCategoryId,
  AccountingEntry,
  AccountingEntryDraft,
  AccountingEntryType,
  AccountingMonthData,
  AccountingSettingsDraft,
  currentMonthInput,
  formatMoney,
  getAccountingCategory,
  getBudgetHealth,
  getVisibleAccountingEntries,
  sanitizeMoneyInput,
  sortAccountingEntries,
  todayDateInput
} from './lib/accounting';
import {
  createAccountingEntry,
  createAccountingCategory,
  deleteAccountingEntry,
  deleteAccountingCategory,
  getAccountingMonth,
  loginAccounting,
  updateAccountingCategory,
  updateAccountingEntry,
  updateAccountingSettings
} from './lib/accountingApi';
import {
  FileFolder,
  FileFolderView,
  UploadedFile,
  createFileFolder,
  createFileLink,
  deleteFileFolder,
  deleteUploadedFile,
  getFileFolderView,
  renameFileFolder,
  uploadFile
} from './lib/fileApi';
import { createDraftAutosaveRepository } from './lib/draftAutosave';
import { normalizeImageUrl } from './lib/imageUrl';
import { HostedImage, deleteHostedImage, listHostedImages, uploadHostedImage } from './lib/imageApi';
import { MarkdownBlock, parseMarkdown } from './lib/markdown';
import { createMarkdownImageBlock, getFirstClipboardImage, insertAtSelection } from './lib/markdownInsert';
import { AppNotification, NotificationType, createNotification } from './lib/notification';
import { formatTagInput, parseTagInput } from './lib/tags';
import accountingHeroImage from './assets/accounting-hero.webp';
import faviconImage from './assets/haruhi-favicon.png';
import haruhiAvatarImage from './assets/haruhi-avatar.png';
import haruhiCutoutImage from './assets/haruhi-cutout.png';
import { copyTextToClipboard } from './lib/clipboard';

type ViewMode = 'home' | 'accounting' | 'files' | 'images' | 'admin';
type EditorTab = 'edit' | 'preview';
type AdminStatusFilter = 'all' | PostStatus;
type AccountingTypeFilter = 'all' | AccountingEntryType;
type AccountingCategoryFilter = 'all' | AccountingCategoryId;
type PostDateFilter = 'all' | '7d' | '30d' | 'year';
type UiIcon = ReturnType<typeof getCategoryIcon> | 'calendar' | 'clock' | 'tag' | 'spark' | 'grid' | 'draft' | 'edit';

const safeImageAttributes = {
  decoding: 'async',
  loading: 'lazy',
  referrerPolicy: 'no-referrer'
} as const;

const draftRepository = createDraftAutosaveRepository();
const ADMIN_SESSION_KEY = 'kitepop-admin-session';
const USER_SESSION_KEY = 'kitepop-user-session';
const ACCOUNTING_SESSION_KEY = 'kitepop-accounting-session';
const EMPTY_FILE_FOLDER_VIEW: FileFolderView = {
  folder: null,
  breadcrumbs: [],
  folders: [],
  files: []
};

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

const EMPTY_COMMENT_FORM = {
  content: ''
};

const EMPTY_USER_FORM = {
  username: '',
  password: '',
  nickname: ''
};

const EMPTY_ADMIN_USER_FORM = {
  username: '',
  password: '',
  nickname: '',
  permission: 'reader' as BlogUser['permission']
};

const ACCOUNTING_CATEGORY_TYPE_LABELS: Record<AccountingCategory['type'], string> = {
  expense: '支出',
  income: '收入',
  both: '通用'
};

function getAccountingCategoryLabel(category: AccountingCategory, categories: AccountingCategory[]) {
  const hasDuplicateName = categories.some((item) => item.id !== category.id && item.name === category.name);
  return hasDuplicateName ? `${category.name} · ${ACCOUNTING_CATEGORY_TYPE_LABELS[category.type]}` : category.name;
}

const EMPTY_ACCOUNTING_ENTRY: AccountingEntryDraft = {
  type: 'expense',
  amountYuan: '',
  category: 'food',
  account: '微信',
  spentAt: todayDateInput(),
  note: '',
  includeInSaving: true
};

const EMPTY_ACCOUNTING_SETTINGS: AccountingSettingsDraft = {
  monthlyBudgetYuan: '',
  savingGoal: {
    name: '本月存钱计划',
    targetSavingYuan: '',
    availableBudgetYuan: '',
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

function saveAdminSession(session: { token: string; expiresAt?: string }) {
  window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
}

function clearAdminSession() {
  window.localStorage.removeItem(ADMIN_SESSION_KEY);
}

function saveUserSession(session: UserSession) {
  window.localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
}

function clearUserSession() {
  window.localStorage.removeItem(USER_SESSION_KEY);
}

function formatBytes(bytes = 0): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
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

function formatDateTime(value?: string): string {
  if (!value) return '';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function Icon({ className = '', name }: { className?: string; name: UiIcon }) {
  const paths: Record<UiIcon, ReactNode> = {
    calendar: (
      <>
        <rect height="15" rx="3" width="16" x="4" y="5" />
        <path d="M8 3v4M16 3v4M4 10h16" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    tag: (
      <>
        <path d="M4 5v6.4a3 3 0 0 0 .88 2.12l5.6 5.6a3 3 0 0 0 4.24 0l4.4-4.4a3 3 0 0 0 0-4.24l-5.6-5.6A3 3 0 0 0 11.4 4H5a1 1 0 0 0-1 1Z" />
        <circle cx="8.5" cy="8.5" r="1.2" />
      </>
    ),
    spark: (
      <>
        <path d="M12 3l1.65 5.35L19 10l-5.35 1.65L12 17l-1.65-5.35L5 10l5.35-1.65L12 3Z" />
        <path d="M18 16l.75 2.25L21 19l-2.25.75L18 22l-.75-2.25L15 19l2.25-.75L18 16Z" />
      </>
    ),
    grid: (
      <>
        <rect height="5" rx="1.2" width="5" x="4" y="4" />
        <rect height="5" rx="1.2" width="5" x="15" y="4" />
        <rect height="5" rx="1.2" width="5" x="4" y="15" />
        <rect height="5" rx="1.2" width="5" x="15" y="15" />
      </>
    ),
    draft: (
      <>
        <path d="M5 19h14" />
        <path d="M7 15.5l8.8-8.8a2.1 2.1 0 0 1 3 3L10 18l-4 1 1-3.5Z" />
      </>
    ),
    edit: (
      <>
        <path d="M5 19h14" />
        <path d="M7 15.5l8.8-8.8a2.1 2.1 0 0 1 3 3L10 18l-4 1 1-3.5Z" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
      </>
    ),
    shield: <path d="M12 3l7 3v5.2c0 4.2-2.8 7.9-7 9.8-4.2-1.9-7-5.6-7-9.8V6l7-3Z" />,
    book: (
      <>
        <path d="M5 4h7a4 4 0 0 1 4 4v12H8a3 3 0 0 0-3 3V4Z" />
        <path d="M19 4h-3a4 4 0 0 0-4 4v12h7V4Z" />
      </>
    ),
    hash: (
      <>
        <path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16" />
      </>
    )
  };

  return (
    <span aria-hidden="true" className={`ui-icon icon-${name} ${className}`}>
      <svg focusable="false" viewBox="0 0 24 24">
        {paths[name]}
      </svg>
    </span>
  );
}

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

function permissionLabel(permission?: BlogUser['permission']): string {
  return permission === 'admin' ? '管理员' : '阅读用户';
}

function FilterMenu({
  label,
  onSelect,
  options
}: {
  label: string;
  onSelect: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <details className="filter-menu">
      <summary>{label}</summary>
      <div>
        {options.map(([value, text]) => (
          <button
            key={value}
            onClick={(event) => {
              onSelect(value);
              event.currentTarget.closest('details')?.removeAttribute('open');
            }}
            type="button"
          >
            {text}
          </button>
        ))}
      </div>
    </details>
  );
}

function App() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [mode, setMode] = useState<ViewMode>('home');
  const [activeCategory, setActiveCategory] = useState<BlogCategoryId | 'all'>('all');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<PostDateFilter>('all');
  const [detailPostId, setDetailPostId] = useState<string | null>(() => {
    const match = window.location.hash.match(/^#\/posts\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  });
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentForm, setCommentForm] = useState(EMPTY_COMMENT_FORM);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentEditDrafts, setCommentEditDrafts] = useState<Record<string, string>>({});
  const [commentLoading, setCommentLoading] = useState(false);
  const [userSession, setUserSession] = useState<UserSession | null>(() => loadUserSession());
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  const [adminUsers, setAdminUsers] = useState<BlogUser[]>([]);
  const [adminUserForm, setAdminUserForm] = useState(EMPTY_ADMIN_USER_FORM);
  const [adminPanelOpen, setAdminPanelOpen] = useState({ content: false, users: false });
  const [adminUnlocked, setAdminUnlocked] = useState(() => Boolean(loadAdminSession()));
  const [adminToken, setAdminToken] = useState(() => loadAdminSession()?.token ?? '');
  const [password, setPassword] = useState('');
  const [filePassword, setFilePassword] = useState('');
  const [activeFileFolderId, setActiveFileFolderId] = useState('');
  const [fileFolderView, setFileFolderView] = useState<FileFolderView>(EMPTY_FILE_FOLDER_VIEW);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileDragActive, setFileDragActive] = useState(false);
  const [generatedFileLink, setGeneratedFileLink] = useState('');
  const [imagePassword, setImagePassword] = useState('');
  const [hostedImages, setHostedImages] = useState<HostedImage[]>([]);
  const [imageDragActive, setImageDragActive] = useState(false);
  const [copiedImageLink, setCopiedImageLink] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageHostInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const coverImageInputRef = useRef<HTMLInputElement | null>(null);
  const contentEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const trailRef = useRef(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BlogPostDraft>(() => draftRepository.load() ?? EMPTY_FORM);
  const [tagInput, setTagInput] = useState(() => {
    const draft = draftRepository.load() ?? EMPTY_FORM;
    return formatTagInput(draft.tags);
  });
  const [editorTab, setEditorTab] = useState<EditorTab>('edit');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [adminStatusFilter, setAdminStatusFilter] = useState<AdminStatusFilter>('all');
  const [notification, setNotification] = useState<AppNotification | null>(null);
  const [autosaveNote, setAutosaveNote] = useState('');
  const [accountingSession, setAccountingSession] = useState(() => loadAccountingSession());
  const [accountingPassword, setAccountingPassword] = useState('');
  const [accountingMonth, setAccountingMonth] = useState(currentMonthInput());
  const [accountingTypeFilter, setAccountingTypeFilter] = useState<AccountingTypeFilter>('all');
  const [accountingCategoryFilter, setAccountingCategoryFilter] = useState<AccountingCategoryFilter>('all');
  const [accountingData, setAccountingData] = useState<AccountingMonthData | null>(null);
  const [accountingEntriesExpanded, setAccountingEntriesExpanded] = useState(false);
  const [accountingForm, setAccountingForm] = useState<AccountingEntryDraft>(EMPTY_ACCOUNTING_ENTRY);
  const [editingAccountingId, setEditingAccountingId] = useState<string | null>(null);
  const [accountingSettingsForm, setAccountingSettingsForm] =
    useState<AccountingSettingsDraft>(EMPTY_ACCOUNTING_SETTINGS);
  const [customAccountingCategoryName, setCustomAccountingCategoryName] = useState('');
  const [customAccountingCategoryType, setCustomAccountingCategoryType] = useState<AccountingEntryType>('expense');
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, { name: string; type: 'income' | 'expense' | 'both' }>>({});

  const visiblePosts = useMemo(
    () => filterPosts(posts, { category: activeCategory, query, tags: activeTags }),
    [activeCategory, activeTags, posts, query]
  );
  const indexedPosts = useMemo(() => filterPostsByDate(visiblePosts, dateFilter), [dateFilter, visiblePosts]);
  const selectedPost = indexedPosts.find((post) => post.id === selectedPostId) ?? indexedPosts[0];
  const detailPost = posts.find((post) => post.id === detailPostId || post.slug === detailPostId) ?? null;
  const selectedCoverImage = getSafeImageUrl(selectedPost?.coverImage);
  const publishedCount = posts.filter((post) => post.status === 'published').length;
  const draftCount = posts.filter((post) => post.status === 'draft').length;
  const adminPosts = posts.filter((post) => adminStatusFilter === 'all' || post.status === adminStatusFilter);
  const formCoverImage = getSafeImageUrl(form.coverImage);
  const userToken = userSession?.token ?? '';
  const accountingToken = accountingSession?.token ?? '';
  const accountingCategories = useMemo(() => {
    const categories = accountingData?.categories?.length ? accountingData.categories : ACCOUNTING_CATEGORIES;
    return categories.filter((category) => category.type === 'both' || category.type === accountingForm.type);
  }, [accountingData?.categories, accountingForm.type]);
  const allAccountingCategories = accountingData?.categories?.length ? accountingData.categories : ACCOUNTING_CATEGORIES;
  const customAccountingCategories = allAccountingCategories.filter((category) => category.custom);
  const accountingPaymentMethods = useMemo(() => {
    const methods = [...ACCOUNTING_PAYMENT_METHODS];
    if (accountingForm.account && !methods.includes(accountingForm.account as (typeof ACCOUNTING_PAYMENT_METHODS)[number])) {
      return [...methods, accountingForm.account];
    }
    return methods;
  }, [accountingForm.account]);
  const accountingEntries = useMemo(() => sortAccountingEntries(accountingData?.entries ?? []), [accountingData?.entries]);
  const visibleAccountingEntries = getVisibleAccountingEntries(accountingEntries, accountingEntriesExpanded);
  const hasCollapsedAccountingEntries = accountingEntries.length > ACCOUNTING_ENTRY_COLLAPSE_LIMIT;
  const budgetHealth = getBudgetHealth({
    remainingCents: accountingData?.summary.budgetRemainingCents ?? 0,
    limitCents: accountingData?.summary.budgetLimitCents ?? 0
  });

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

  const loadAdminUsers = async (token = adminToken) => {
    if (!token) return;
    try {
      setAdminUsers(await listUsers(token));
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '用户列表加载失败');
    }
  };

  const loadFiles = async (token = adminToken, folderId = activeFileFolderId) => {
    if (!token) return;
    try {
      setFileFolderView(await getFileFolderView(token, folderId));
      setActiveFileFolderId(folderId);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文件列表加载失败');
    }
  };

  const loadHostedImages = async (token = adminToken) => {
    if (!token) return;
    try {
      setHostedImages(await listHostedImages(token));
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '图床列表加载失败');
    }
  };

  const syncAccountingSettingsForm = (data: AccountingMonthData) => {
    setAccountingSettingsForm({
      monthlyBudgetYuan: centsToInput(data.settings.monthlyBudgetCents),
      savingGoal: data.savingGoal
        ? {
            name: data.savingGoal.name,
            targetSavingYuan: centsToInput(
              data.savingGoal.targetSavingCents ??
                data.savingGoal.projectedSavingCents ??
                data.savingGoal.targetCents
            ),
            availableBudgetYuan: centsToInput(
              data.savingGoal.availableBudgetCents ??
                data.savingGoal.budgetLimitCents ??
                data.savingGoal.safeToSpendCents ??
                data.summary.budgetLimitCents
            ),
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
    const syncRoute = () => {
      const match = window.location.hash.match(/^#\/posts\/(.+)$/);
      setDetailPostId(match ? decodeURIComponent(match[1]) : null);
    };
    window.addEventListener('hashchange', syncRoute);
    syncRoute();
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

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
        await loadPosts(true, saved.token);
        await loadAdminUsers(saved.token);
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
    if (accountingToken) {
      void loadAccountingData(accountingToken, accountingMonth, accountingTypeFilter, accountingCategoryFilter);
    }
  }, [accountingToken, accountingMonth, accountingTypeFilter, accountingCategoryFilter]);

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
    return () => {};
  }, []);

  useEffect(() => {
    if (!detailPost) {
      setComments([]);
      return;
    }
    void (async () => {
      try {
        const nextComments = await listPostComments(detailPost.slug);
        setComments(nextComments);
      } catch {
        setComments([]);
      }
    })();
  }, [detailPost]);

  useEffect(() => {
    if (mode === 'files' && adminToken) {
      void loadFiles(adminToken, activeFileFolderId);
    }
  }, [mode, adminToken, activeFileFolderId]);

  useEffect(() => {
    if (mode === 'images' && adminToken) {
      void loadHostedImages(adminToken);
    }
  }, [mode, adminToken]);

  useEffect(() => {
    setAccountingEntriesExpanded(false);
  }, [accountingMonth, accountingTypeFilter, accountingCategoryFilter]);

  const updateForm = (patch: Partial<BlogPostDraft>) => {
    setForm((current) => ({ ...current, ...patch }));
    setNotification((current) => (current?.type === 'error' ? null : current));
  };

  const spawnParticle = (x: number, y: number, burst = false) => {
    const count = burst ? 10 : 1;
    for (let index = 0; index < count; index += 1) {
      const particle = document.createElement('span');
      particle.className = burst ? 'pointer-particle burst' : 'pointer-particle';
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      particle.style.setProperty('--dx', `${(Math.random() - 0.5) * (burst ? 90 : 26)}px`);
      particle.style.setProperty('--dy', `${(Math.random() - 0.7) * (burst ? 90 : 30)}px`);
      document.body.appendChild(particle);
      window.setTimeout(() => particle.remove(), burst ? 780 : 520);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse') return;
    const now = performance.now();
    if (now - trailRef.current < 45) return;
    trailRef.current = now;
    spawnParticle(event.clientX, event.clientY);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    spawnParticle(event.clientX, event.clientY, true);
  };

  const updateTagInput = (value: string) => {
    setTagInput(value);
    updateForm({ tags: parseTagInput(value) });
  };

  const toggleActiveTag = (tag: string) => {
    setActiveTags((current) =>
      current.some((selectedTag) => selectedTag.toLowerCase() === tag.toLowerCase())
        ? current.filter((selectedTag) => selectedTag.toLowerCase() !== tag.toLowerCase())
        : [...current, tag]
    );
    setSelectedPostId(null);
    setDetailPostId(null);
  };

  const openPostDetail = (post: BlogPost) => {
    setSelectedPostId(post.id);
    setDetailPostId(post.slug);
    window.location.hash = `/posts/${post.slug}`;
  };

  const closePostDetail = () => {
    setDetailPostId(null);
    window.location.hash = '';
  };

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!detailPost || commentLoading) return;
    if (!userToken) {
      notify('error', '请先登录后再评论');
      return;
    }
    if (!commentForm.content.trim()) {
      notify('error', '请填写评论内容');
      return;
    }
    setCommentLoading(true);
    try {
      const comment = await createPostComment(detailPost.slug, commentForm, userToken);
      setComments((current) => [comment, ...current]);
      setCommentForm(EMPTY_COMMENT_FORM);
      notify('success', '评论已发布');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '评论发布失败');
    } finally {
      setCommentLoading(false);
    }
  };

  const submitUserAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const session =
        authMode === 'register'
          ? await registerUser(userForm)
          : await loginUser(userForm.username, userForm.password);
      saveUserSession(session);
      setUserSession(session);
      setUserForm(EMPTY_USER_FORM);
      notify('success', authMode === 'register' ? '注册成功，已登录' : '登录成功');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '用户操作失败');
    }
  };

  const logoutUser = () => {
    clearUserSession();
    setUserSession(null);
    notify('info', '已退出当前用户');
  };

  const startEditComment = (comment: PostComment) => {
    setEditingCommentId(comment.id);
    setCommentEditDrafts((current) => ({ ...current, [comment.id]: comment.content }));
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
  };

  const saveCommentEdit = async (comment: PostComment) => {
    if (!detailPost || !userToken) return;
    const content = (commentEditDrafts[comment.id] ?? '').trim();
    if (!content) {
      notify('error', '评论内容不能为空');
      return;
    }
    try {
      const updated = await updatePostComment(detailPost.slug, comment.id, { content }, userToken);
      setComments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingCommentId(null);
      notify('success', '评论已更新');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '评论更新失败');
    }
  };

  const removeComment = async (comment: PostComment) => {
    if (!detailPost || !userToken) return;
    if (!window.confirm('确定删除这条评论吗？')) return;
    try {
      await deletePostComment(detailPost.slug, comment.id, userToken);
      setComments((current) => current.filter((item) => item.id !== comment.id));
      if (editingCommentId === comment.id) setEditingCommentId(null);
      notify('success', '评论已删除');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '评论删除失败');
    }
  };

  const saveAdminUser = async (user: BlogUser) => {
    try {
      const updated = await updateUser(user.id, user, adminToken);
      setAdminUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      notify('success', '用户资料已更新');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '用户更新失败');
    }
  };

  const submitAdminUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adminUserForm.username.trim() || !adminUserForm.password.trim()) {
      notify('error', '请填写用户名和密码');
      return;
    }
    try {
      const user = await createUser(adminUserForm, adminToken);
      setAdminUsers((current) => [user, ...current]);
      setAdminUserForm(EMPTY_ADMIN_USER_FORM);
      notify('success', '用户已创建');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '用户创建失败');
    }
  };

  const removeAdminUser = async (user: BlogUser) => {
    if (!window.confirm(`确定删除用户 ${user.username} 吗？`)) return;
    try {
      await deleteUser(user.id, adminToken);
      setAdminUsers((current) => current.filter((item) => item.id !== user.id));
      notify('success', '用户已删除');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '用户删除失败');
    }
  };

  const startCreate = () => {
    const draft = draftRepository.load() ?? EMPTY_FORM;
    setEditingId(null);
    setForm(draft);
    setTagInput(formatTagInput(draft.tags));
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
    setTagInput(formatTagInput(post.tags));
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
      notify('error', '请输入 HTTPS 图片 URL，或使用本站图床图片链接');
      return;
    }

    const payload = {
      ...form,
      tags: parseTagInput(tagInput),
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
      const result = (await response.json()) as { ok?: boolean; message?: string; token?: string; expiresAt?: string };

      if (!response.ok || !result.ok || !result.token) {
        notify('error', result.message || '后台口令不正确');
        return;
      }

      setAdminUnlocked(true);
      setAdminToken(result.token);
      saveAdminSession({ token: result.token, expiresAt: result.expiresAt });
      setPassword('');
      await loadPosts(true, result.token);
      await loadAdminUsers(result.token);
      notify('success', '已进入后台');
    } catch {
      notify('error', '无法连接后台登录接口');
    }
  };

  const unlockFiles = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ password: filePassword })
      });
      const result = (await response.json()) as { ok?: boolean; message?: string; token?: string; expiresAt?: string };

      if (!response.ok || !result.ok || !result.token) {
        notify('error', result.message || '后台口令不正确');
        return;
      }

      setAdminUnlocked(true);
      setAdminToken(result.token);
      saveAdminSession({ token: result.token, expiresAt: result.expiresAt });
      setFilePassword('');
      await loadFiles(result.token, activeFileFolderId);
      notify('success', '已进入文件仓库');
    } catch {
      notify('error', '无法连接文件登录接口');
    }
  };

  const unlockImages = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ password: imagePassword })
      });
      const result = (await response.json()) as { ok?: boolean; message?: string; token?: string; expiresAt?: string };

      if (!response.ok || !result.ok || !result.token) {
        notify('error', result.message || '后台口令不正确');
        return;
      }

      setAdminUnlocked(true);
      setAdminToken(result.token);
      saveAdminSession({ token: result.token, expiresAt: result.expiresAt });
      setImagePassword('');
      await loadHostedImages(result.token);
      notify('success', '已进入图床');
    } catch {
      notify('error', '无法连接图床登录接口');
    }
  };

  const handleHostedImageUpload = async (file?: File) => {
    if (!file || !adminToken) return;
    if (!file.type.startsWith('image/')) {
      notify('error', '图床只允许上传图片文件');
      return;
    }

    setUploadingImage(true);
    setCopiedImageLink('');
    try {
      const image = await uploadHostedImage(file, adminToken);
      const link = new URL(image.path, window.location.origin).toString();
      setCopiedImageLink(link);
      await loadHostedImages(adminToken);
      const copied = await copyTextToClipboard(link);
      notify('success', copied ? '图片已上传，链接已复制' : '图片已上传，请手动复制链接');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '图片上传失败');
    } finally {
      setUploadingImage(false);
      if (imageHostInputRef.current) imageHostInputRef.current.value = '';
    }
  };

  const copyHostedImageLink = async (image: HostedImage) => {
    const link = new URL(image.path, window.location.origin).toString();
    setCopiedImageLink(link);
    const copied = await copyTextToClipboard(link);
    notify(copied ? 'success' : 'info', copied ? '图片链接已复制' : '请手动复制图片链接');
  };

  const removeHostedImage = async (image: HostedImage) => {
    if (!adminToken || !window.confirm(`确认删除 ${image.originalName} 吗？`)) return;
    try {
      await deleteHostedImage(image.id, adminToken);
      await loadHostedImages(adminToken);
      if (copiedImageLink.includes(image.id)) setCopiedImageLink('');
      notify('success', '图片已删除');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '图片删除失败');
    }
  };

  const handleFileUpload = async (file?: File) => {
    if (!file || !adminToken) return;
    setUploadingFile(true);
    setGeneratedFileLink('');

    try {
      await uploadFile(file, adminToken, activeFileFolderId);
      await loadFiles(adminToken, activeFileFolderId);
      notify('success', '文件已上传');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文件上传失败');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const copyFileLink = async (file: UploadedFile) => {
    if (!adminToken) return;
    try {
      const link = await createFileLink(file.id, adminToken);
      const absoluteLink = new URL(link.path, window.location.origin).toString();
      setGeneratedFileLink(absoluteLink);
      const copied = await copyTextToClipboard(absoluteLink);
      notify('success', copied ? '签名链接已复制' : '签名链接已生成，请手动复制');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '生成链接失败');
    }
  };

  const removeUploadedFile = async (file: UploadedFile) => {
    if (!adminToken) return;
    const confirmed = window.confirm(`确认删除 ${file.originalName} 吗？删除后签名链接会立即失效。`);
    if (!confirmed) return;

    try {
      await deleteUploadedFile(file.id, adminToken);
      await loadFiles(adminToken, activeFileFolderId);
      setGeneratedFileLink('');
      notify('success', '文件已删除');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文件删除失败');
    }
  };

  const openFileFolder = (folderId = '') => {
    setGeneratedFileLink('');
    setActiveFileFolderId(folderId);
  };

  const createFolderInCurrentFolder = async () => {
    if (!adminToken) return;
    const name = window.prompt('文件夹名称');
    if (!name?.trim()) return;

    try {
      await createFileFolder({ name: name.trim(), parentId: activeFileFolderId }, adminToken);
      await loadFiles(adminToken, activeFileFolderId);
      notify('success', '文件夹已创建');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文件夹创建失败');
    }
  };

  const renameFolderItem = async (folder: FileFolder) => {
    if (!adminToken) return;
    const name = window.prompt('新的文件夹名称', folder.name);
    if (!name?.trim() || name.trim() === folder.name) return;

    try {
      await renameFileFolder(folder.id, name.trim(), adminToken);
      await loadFiles(adminToken, activeFileFolderId);
      notify('success', '文件夹已重命名');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文件夹重命名失败');
    }
  };

  const removeFolderItem = async (folder: FileFolder) => {
    if (!adminToken) return;
    const confirmed = window.confirm(`确认删除空文件夹 ${folder.name} 吗？非空文件夹不会被删除。`);
    if (!confirmed) return;

    try {
      await deleteFileFolder(folder.id, adminToken);
      await loadFiles(adminToken, activeFileFolderId);
      notify('success', '文件夹已删除');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文件夹删除失败');
    }
  };

  const insertMarkdownAtEditor = (snippet: string, selectionStart?: number, selectionEnd?: number) => {
    const editor = contentEditorRef.current;
    const source = editor?.value ?? form.content;
    const start = selectionStart ?? editor?.selectionStart ?? source.length;
    const end = selectionEnd ?? editor?.selectionEnd ?? start;
    const next = insertAtSelection(source, snippet, start, end);
    updateForm({ content: next.value });
    window.setTimeout(() => {
      contentEditorRef.current?.focus();
      contentEditorRef.current?.setSelectionRange(next.cursor, next.cursor);
    }, 0);
  };

  const insertMarkdownSnippet = (before: string, after = '', placeholder = '内容') => {
    insertMarkdownAtEditor(`${before}${placeholder}${after}`);
    notify('info', 'Markdown 片段已插入正文');
  };

  const insertImageFile = async (file?: File, selectionStart?: number, selectionEnd?: number) => {
    if (!file) return;
    if (!adminToken) {
      notify('error', '请先进入后台再上传图片');
      return;
    }
    if (!file.type.startsWith('image/')) {
      notify('error', '只能上传图片文件');
      return;
    }

    setUploadingImage(true);
    try {
      const image = await uploadHostedImage(file, adminToken);
      insertMarkdownAtEditor(createMarkdownImageBlock(image.originalName, image.path), selectionStart, selectionEnd);
      notify('success', '图片已上传并插入正文');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '图片上传失败');
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const uploadCoverImageFile = async (file?: File) => {
    if (!file) return;
    if (!adminToken) {
      notify('error', '请先进入后台再上传封面');
      return;
    }
    if (!file.type.startsWith('image/')) {
      notify('error', '只能上传图片文件');
      return;
    }

    setUploadingImage(true);
    try {
      const image = await uploadHostedImage(file, adminToken);
      updateForm({ coverImage: image.path });
      await loadHostedImages(adminToken);
      notify('success', '封面图已上传并填入');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '封面图上传失败');
    } finally {
      setUploadingImage(false);
      if (coverImageInputRef.current) coverImageInputRef.current.value = '';
    }
  };

  const pasteImageIntoEditor = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const image = getFirstClipboardImage(event.clipboardData.items);
    if (!image) return;
    const start = event.currentTarget.selectionStart;
    const end = event.currentTarget.selectionEnd;
    event.preventDefault();
    void insertImageFile(image, start, end);
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

  const addCustomAccountingCategory = async () => {
    if (!accountingToken) return;
    const name = customAccountingCategoryName.trim();
    if (!name) {
      notify('error', '请先填写分类名称');
      return;
    }

    try {
      await createAccountingCategory({ name, type: customAccountingCategoryType }, accountingToken);
      await loadAccountingData();
      setCustomAccountingCategoryName('');
      notify('success', '自定义分类已添加');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '分类创建失败');
    }
  };

  const saveCustomAccountingCategory = async (id: string) => {
    if (!accountingToken) return;
    const draft = categoryDrafts[id];
    if (!draft?.name?.trim()) {
      notify('error', '分类名称不能为空');
      return;
    }

    try {
      await updateAccountingCategory(id, { name: draft.name.trim(), type: draft.type }, accountingToken);
      await loadAccountingData();
      notify('success', '分类已更新');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '分类更新失败');
    }
  };

  const removeCustomAccountingCategory = async (id: string) => {
    if (!accountingToken) return;
    if (!window.confirm('确认删除这个自定义分类吗？')) return;

    try {
      await deleteAccountingCategory(id, accountingToken);
      await loadAccountingData();
      notify('success', '分类已删除');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '分类删除失败');
    }
  };

  const startEditAccountingEntry = (entry: AccountingEntry) => {
    setEditingAccountingId(entry.id);
    setAccountingForm({
      type: entry.type,
      amountYuan: centsToInput(entry.amountCents),
      category: entry.category,
      account: entry.account,
      spentAt: entry.spentAt,
      note: entry.note,
      includeInSaving: entry.includeInSaving
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
      notify('success', '预算和存钱计划已保存');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '设置保存失败');
    }
  };

  return (
    <main className="app-shell" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}>
      <header className="topbar">
        <button className="brand-button" onClick={() => setMode('home')} type="button">
          <span className="brand-mark" aria-hidden="true">
            <img alt="" src={haruhiAvatarImage} />
          </span>
          <span>
            <strong>Kitepop SOS</strong>
            <small>Haruhi style / life / src / study / notes</small>
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
          <button className={mode === 'files' ? 'active' : ''} onClick={() => setMode('files')} type="button">
            文件
          </button>
          <button className={mode === 'images' ? 'active' : ''} onClick={() => setMode('images')} type="button">
            图床
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

      {mode === 'home' && detailPost ? (
        <section className="article-page">
          <div className="article-page-shell">
            <aside className="article-page-rail">
              <button className="back-link" onClick={closePostDetail} type="button">{'\u8fd4\u56de\u6587\u7ae0\u5217\u8868'}</button>
              <div className="article-rail-card">
                <p className="eyebrow">Reading Focus</p>
                <strong>{getCategory(detailPost.category).name}</strong>
                <span>{formatDateTime(detailPost.updatedAt)}</span>
                <span>{calculateReadingMinutes(detailPost.content)} {'\u5206\u949f\u9605\u8bfb'}</span>
              </div>
              <div className="article-rail-card">
                <p className="eyebrow">Active Tags</p>
                <div className="tag-row article-rail-tags">
                  {detailPost.tags.map((tag) => (
                    <button key={tag} onClick={() => toggleActiveTag(tag)} type="button">
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
                  {getSafeImageUrl(detailPost.coverImage) ? (
                    <img alt={detailPost.title} className="article-cover-image" src={getSafeImageUrl(detailPost.coverImage)} {...safeImageAttributes} />
                  ) : (
                    <div className={`article-cover cover-${detailPost.cover}`}>
                      <span>
                        <Icon name={getCategoryIcon(detailPost.category)} />
                        {getCategory(detailPost.category).name}
                      </span>
                    </div>
                  )}
                </div>
                <div className="article-header-copy">
                  <p className="article-meta">
                    <span><Icon name="calendar" />{formatDateTime(detailPost.updatedAt)}</span>
                    <span><Icon name="clock" />{calculateReadingMinutes(detailPost.content)} {'\u5206\u949f\u9605\u8bfb'}</span>
                    <span><Icon name={getCategoryIcon(detailPost.category)} />{getCategory(detailPost.category).name}</span>
                  </p>
                  <h1>{detailPost.title}</h1>
                  <p className="summary">{detailPost.summary}</p>
                  <div className="tag-row">
                    {detailPost.tags.map((tag) => (
                      <button key={tag} onClick={() => toggleActiveTag(tag)} type="button">
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
                  <h3>{'\u8bc4\u8bba'} {'\u00b7'} {comments.length}</h3>
                  {userSession ? (
                    <div className="comment-user-chip">
                      <strong>{userSession.user.nickname}</strong>
                      <span>{permissionLabel(userSession.user.permission)}</span>
                    </div>
                  ) : null}
                </div>
                {userSession ? (
                  <form className="comment-form" onSubmit={submitComment}>
                    <textarea
                      aria-label={'\u8bc4\u8bba\u5185\u5bb9'}
                      onChange={(event) => setCommentForm((current) => ({ ...current, content: event.target.value }))}
                      placeholder={'\u5199\u70b9\u60f3\u6cd5...'}
                      value={commentForm.content}
                    />
                    <button disabled={commentLoading} type="submit">{commentLoading ? '\u53d1\u5e03\u4e2d...' : '\u53d1\u5e03\u8bc4\u8bba'}</button>
                  </form>
                ) : (
                  <div className="comment-empty-card">
                    <strong>{'\u767b\u5f55\u540e\u53ef\u8bc4\u8bba'}</strong>
                    <p>{'\u6ce8\u518c\u540e\u9ed8\u8ba4\u53ea\u6709\u9605\u8bfb\u6743\u9650\uff0c\u8bc4\u8bba\u4f1a\u81ea\u52a8\u663e\u793a\u4f60\u7684\u6635\u79f0\u548c\u6743\u9650\u8eab\u4efd\u3002'}</p>
                  </div>
                )}
                <div className="comment-list">
                  {comments.map((comment) => (
                    <article className="comment-item" key={comment.id}>
                      <strong>{comment.nickname}<span>{comment.role}</span></strong>
                      {editingCommentId === comment.id ? (
                        <div className="comment-edit-box">
                          <textarea
                            aria-label={'\u7f16\u8f91\u8bc4\u8bba'}
                            onChange={(event) => setCommentEditDrafts((current) => ({ ...current, [comment.id]: event.target.value }))}
                            value={commentEditDrafts[comment.id] ?? ''}
                          />
                          <div className="comment-actions">
                            <button onClick={() => void saveCommentEdit(comment)} type="button">{'\u4fdd\u5b58'}</button>
                            <button className="ghost" onClick={cancelEditComment} type="button">{'\u53d6\u6d88'}</button>
                          </div>
                        </div>
                      ) : (
                        <p>{comment.content}</p>
                      )}
                      <div className="comment-meta">
                        <small>{formatDateTime(comment.updatedAt || comment.createdAt)}</small>
                        {userSession && (userSession.user.permission === 'admin' || comment.userId === userSession.user.id) ? (
                          <div className="comment-actions">
                            <button className="ghost" onClick={() => startEditComment(comment)} type="button">{'\u7f16\u8f91'}</button>
                            <button className="danger" onClick={() => void removeComment(comment)} type="button">{'\u5220\u9664'}</button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                  {comments.length === 0 ? <div className="empty-state">{'\u8fd8\u6ca1\u6709\u8bc4\u8bba\u3002'}</div> : null}
                </div>
              </section>
            </div>
          </div>
        </section>
      ) : mode === 'home' ? (
        <>
          <section className="hero-band">
            <div className="hero-copy">
              <p className="eyebrow">SOS Brigade Log</p>
              <h1>Kitepop SOS</h1>
              <p>
                这里沉淀个人生活、SRC 挖掘案例、专业学习和知识点记录。
              </p>
              <div className="hero-notes">
                <span>Poster-led identity</span>
                <span>Life / SRC / Study / Notes</span>
              </div>
              <div className="hero-actions">
                <button onClick={() => setMode('admin')} type="button">{'SOS \u53d1\u6587'}</button>
                <button className="ghost" onClick={() => setActiveCategory('src')} type="button">查看 SRC 复盘</button>
              </div>
            </div>
            <div className="hero-visual hero-art" aria-label="blog visual cover">
              <img alt="Haruhi Suzumiya" src={haruhiCutoutImage} />
              <span className="hero-art-ring" aria-hidden="true" />
              <span className="hero-art-corners" aria-hidden="true" />
            </div>
          </section>

          <section className="metrics-strip">
            <span><Icon name="spark" /><strong>{publishedCount}</strong> 已发布</span>
            <span><Icon name="draft" /><strong>{draftCount}</strong> 草稿</span>
            <span><Icon name="grid" /><strong>{BLOG_CATEGORIES.length}</strong> 内容模块</span>
          </section>

          <section className="user-auth-card">
            {userSession ? (
              <>
                <div>
                  <strong>{userSession.user.nickname}</strong>
                  <span>{userSession.user.permission === 'admin' ? '\u56e2\u957f' : '\u56e2\u5458'}</span>
                </div>
                <button className="ghost" onClick={logoutUser} type="button">退出登录</button>
              </>
            ) : (
              <form onSubmit={submitUserAuth}>
                <div className="segmented-control compact-tabs">
                  <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')} type="button">登录</button>
                  <button className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')} type="button">注册</button>
                </div>
                <input
                  aria-label="用户名"
                  onChange={(event) => setUserForm((current) => ({ ...current, username: event.target.value }))}
                  placeholder="用户名"
                  value={userForm.username}
                />
                <input
                  aria-label="密码"
                  onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="密码"
                  type="password"
                  value={userForm.password}
                />
                {authMode === 'register' ? (
                  <input
                    aria-label="昵称"
                    onChange={(event) => setUserForm((current) => ({ ...current, nickname: event.target.value }))}
                    placeholder="昵称"
                    value={userForm.nickname}
                  />
                ) : null}
                <button type="submit">{authMode === 'register' ? '创建账号' : '登录评论'}</button>
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
                    label={dateFilter === 'all' ? '全部时间' : dateFilter === '7d' ? '最近 7 天' : dateFilter === '30d' ? '最近 30 天' : '今年'}
                    options={[
                      ['all', '全部时间'],
                      ['7d', '最近 7 天'],
                      ['30d', '最近 30 天'],
                      ['year', '今年']
                    ]}
                    onSelect={(value) => setDateFilter(value as PostDateFilter)}
                  />
                  <FilterMenu
                    label={activeCategory === 'all' ? '全部分类' : getCategory(activeCategory).name}
                    options={[
                      ['all', '全部分类'],
                      ...BLOG_CATEGORIES.map((category) => [category.id, category.name] as [string, string])
                    ]}
                    onSelect={(value) => {
                      setActiveCategory(value as BlogCategoryId | 'all');
                      setSelectedPostId(null);
                    }}
                  />
                </div>
                {activeTags.length ? (
                  <div className="tag-filter-group" aria-label="已选标签">
                    {activeTags.map((tag) => (
                      <button className="tag-filter-chip" key={tag} onClick={() => toggleActiveTag(tag)} type="button">
                        <Icon name="tag" />
                        {tag}
                        <span>移除</span>
                      </button>
                    ))}
                    <button className="tag-filter-clear" onClick={() => setActiveTags([])} type="button">
                      清空
                    </button>
                  </div>
                ) : (
                  <p className="home-filter-hint">点击文章页标签可加入筛选，这里会保留当前标签组合。</p>
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
                  {indexedPosts.map((post) => {
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
                          {coverImage ? (
                            <img alt="" className="cover-thumb" src={coverImage} {...safeImageAttributes} />
                          ) : (
                            <span className={`cover-dot cover-${post.cover}`}>
                              <Icon name={getCategoryIcon(post.category)} />
                            </span>
                          )}
                        </span>
                        <span className="post-item-copy">
                          <span className="post-item-topline">
                            <em>{category.name}</em>
                            <span>{formatDateTime(post.updatedAt)}</span>
                          </span>
                          <strong>{post.title}</strong>
                          <small>{post.summary}</small>
                          <span className="post-item-footer">
                            <span><Icon name="clock" />{calculateReadingMinutes(post.content)} 分钟</span>
                            <span><Icon name="tag" />{post.tags.slice(0, 2).join(' · ') || '未设标签'}</span>
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
                <img alt="" className="accounting-hero-art" src={accountingHeroImage} />
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
                <div className="metric-card">
                  <i className="metric-icon metric-income" aria-hidden="true" />
                  <span className="metric-label">本月收入</span>
                  <strong>{formatMoney(accountingData?.summary.incomeCents ?? 0)}</strong>
                </div>
                <div className="metric-card">
                  <i className="metric-icon metric-expense" aria-hidden="true" />
                  <span className="metric-label">本月支出</span>
                  <strong>{formatMoney(accountingData?.summary.expenseCents ?? 0)}</strong>
                </div>
                <div className="metric-card">
                  <i className="metric-icon metric-balance" aria-hidden="true" />
                  <span className="metric-label">本月可用</span>
                  <strong>{formatMoney(accountingData?.summary.budgetLimitCents ?? 0)}</strong>
                </div>
                <div className={`metric-card metric-focus metric-${budgetHealth}`}>
                  <i className="metric-icon metric-budget" aria-hidden="true" />
                  <span className="metric-label">剩余可用</span>
                  <strong>{formatMoney(accountingData?.summary.budgetRemainingCents ?? 0)}</strong>
                  <div className="metric-progress" aria-label={`可用额度已用 ${accountingData?.summary.budgetUsedPercent ?? 0}%`}>
                    <span style={{ width: `${Math.min(accountingData?.summary.budgetUsedPercent ?? 0, 100)}%` }} />
                  </div>
                  <small>已用 {accountingData?.summary.budgetUsedPercent ?? 0}%</small>
                </div>
                <div className="metric-card">
                  <i className="metric-icon metric-saving" aria-hidden="true" />
                  <span className="metric-label">计划存钱</span>
                  <strong>{formatMoney(accountingData?.summary.targetSavingCents ?? 0)}</strong>
                  <small>预计 {formatMoney(accountingData?.savingGoal?.projectedSavingCents ?? 0)}</small>
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
                  <div className="ledger-filter-grid">
                    <label>
                      金额
                      <input
                        inputMode="decimal"
                        onChange={(event) => updateAccountingForm({ amountYuan: sanitizeMoneyInput(event.target.value) })}
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
                          <option key={category.id} value={category.id}>
                            {getAccountingCategoryLabel(category, allAccountingCategories)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="ledger-filter-grid">
                    <label>
                      日期
                      <input
                        onChange={(event) => updateAccountingForm({ spentAt: event.target.value })}
                        type="date"
                        value={accountingForm.spentAt}
                      />
                    </label>
                    <label>
                      支付方式
                      <select
                        onChange={(event) => updateAccountingForm({ account: event.target.value })}
                        value={accountingForm.account}
                      >
                        {accountingPaymentMethods.map((method) => (
                          <option key={method} value={method}>{method}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <details className="custom-category-panel">
                    <summary>
                      <strong>自定义分类</strong>
                      <small>添加后会同步出现在记账分类和流水筛选里。</small>
                    </summary>
                    <div className="custom-category-controls">
                      <input
                        onChange={(event) => setCustomAccountingCategoryName(event.target.value)}
                        placeholder="例如：咖啡、服务器、订阅"
                        value={customAccountingCategoryName}
                      />
                      <select
                        onChange={(event) => setCustomAccountingCategoryType(event.target.value as AccountingEntryType)}
                        value={customAccountingCategoryType}
                      >
                        <option value="expense">支出</option>
                        <option value="income">收入</option>
                      </select>
                      <button onClick={() => void addCustomAccountingCategory()} type="button">添加</button>
                    </div>
                    {customAccountingCategories.length ? (
                      <div className="custom-category-list">
                        {customAccountingCategories.map((category) => {
                          const draft = categoryDrafts[category.id] ?? { name: category.name, type: category.type };
                          return (
                            <div className="custom-category-item" key={category.id}>
                              <input
                                onChange={(event) =>
                                  setCategoryDrafts((current) => ({
                                    ...current,
                                    [category.id]: { ...draft, name: event.target.value }
                                  }))
                                }
                                value={draft.name}
                              />
                              <select
                                onChange={(event) =>
                                  setCategoryDrafts((current) => ({
                                    ...current,
                                    [category.id]: { ...draft, type: event.target.value as 'income' | 'expense' | 'both' }
                                  }))
                                }
                                value={draft.type}
                              >
                                <option value="expense">支出</option>
                                <option value="income">收入</option>
                                <option value="both">通用</option>
                              </select>
                              <button onClick={() => void saveCustomAccountingCategory(category.id)} type="button">保存</button>
                              <button className="danger" onClick={() => void removeCustomAccountingCategory(category.id)} type="button">删除</button>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </details>
                  <label>
                    备注
                    <input
                      onChange={(event) => updateAccountingForm({ note: event.target.value })}
                      placeholder="例如：午饭、课程、工资"
                      value={accountingForm.note}
                    />
                  </label>
                  <label className="toggle-row">
                    <input
                      checked={accountingForm.includeInSaving}
                      onChange={(event) => updateAccountingForm({ includeInSaving: event.target.checked })}
                      type="checkbox"
                    />
                    <span>
                      <strong>计入存钱项目</strong>
                      <small>勾选后参与剩余可用计算；收入不会进入本月收入。</small>
                    </span>
                  </label>
                  <button type="submit">{editingAccountingId ? '保存更新' : '保存流水'}</button>
                </form>

                <section className="accounting-card">
                  <div className="panel-heading">
                    <h2>流水筛选 · {accountingEntries.length} 条</h2>
                    {hasCollapsedAccountingEntries ? (
                      <button onClick={() => setAccountingEntriesExpanded((expanded) => !expanded)} type="button">
                        {accountingEntriesExpanded ? '收起' : `展开全部`}
                      </button>
                    ) : null}
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
                        {(accountingData?.categories?.length ? accountingData.categories : ACCOUNTING_CATEGORIES).map((category) => (
                          <option key={category.id} value={category.id}>
                            {getAccountingCategoryLabel(category, allAccountingCategories)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="entry-list">
                    {visibleAccountingEntries.map((entry) => {
                      const category = getAccountingCategory(entry.category, accountingData?.categories);
                      return (
                        <div className="entry-item" key={entry.id}>
                          <span className={`entry-type entry-${entry.type}`}>{entry.type === 'expense' ? '支' : '收'}</span>
                          <span className="entry-main">
                            <strong>{category.name} · {entry.account}</strong>
                            <small>
                              {formatDateTime(entry.createdAt || entry.spentAt)} · 发生 {entry.spentAt}
                              {entry.note ? ` · ${entry.note}` : ''}
                              <em className={`entry-saving-badge ${entry.includeInSaving ? 'active' : ''}`}>
                                {entry.includeInSaving ? '存钱项目' : '普通流水'}
                              </em>
                            </small>
                          </span>
                          <strong className={entry.type === 'expense' ? 'money-expense' : 'money-income'}>
                            {entry.type === 'expense' ? '-' : '+'}{formatMoney(entry.amountCents)}
                          </strong>
                          <span className="entry-actions">
                            <button onClick={() => startEditAccountingEntry(entry)} type="button">编辑</button>
                            <button className="danger" onClick={() => removeAccountingEntry(entry)} type="button">删除</button>
                          </span>
                        </div>
                      );
                    })}
                    {accountingData && accountingData.entries.length === 0 ? (
                      <div className="empty-state">这个筛选条件下还没有流水。</div>
                    ) : null}
                    {hasCollapsedAccountingEntries ? (
                      <button className="entry-toggle" onClick={() => setAccountingEntriesExpanded((expanded) => !expanded)} type="button">
                        {accountingEntriesExpanded
                          ? '收起流水'
                          : `还有 ${accountingEntries.length - ACCOUNTING_ENTRY_COLLAPSE_LIMIT} 条，展开查看`}
                      </button>
                    ) : null}
                  </div>
                </section>

                <form className="accounting-card saving-panel" onSubmit={saveAccountingSettings}>
                  <div className="panel-heading">
                    <h2>预算和存钱计划</h2>
                    <button type="submit">保存设置</button>
                  </div>
                  <label>
                    每月生活费
                    <input
                      inputMode="decimal"
                      onChange={(event) =>
                        setAccountingSettingsForm((current) => ({
                          ...current,
                          monthlyBudgetYuan: sanitizeMoneyInput(event.target.value)
                        }))
                      }
                      placeholder="例如：2000"
                      value={accountingSettingsForm.monthlyBudgetYuan}
                    />
                  </label>
                  <div className="progress-track">
                    <span style={{ width: `${Math.min(accountingData?.summary.budgetUsedPercent ?? 0, 100)}%` }} />
                  </div>
                  <p>可用额度已用 {accountingData?.summary.budgetUsedPercent ?? 0}%</p>
                  {accountingSettingsForm.savingGoal ? (
                    <>
                      <div className="form-grid">
                        <label>
                          本月计划存钱
                          <input
                            inputMode="decimal"
                            onChange={(event) =>
                              setAccountingSettingsForm((current) => ({
                                ...current,
                                savingGoal: {
                                  ...current.savingGoal!,
                                  targetSavingYuan: sanitizeMoneyInput(event.target.value)
                                }
                              }))
                            }
                            placeholder="例如：1000"
                            value={accountingSettingsForm.savingGoal.targetSavingYuan ?? ''}
                          />
                        </label>
                        <label>
                          本月可用额度
                          <input
                            inputMode="decimal"
                            onChange={(event) =>
                              setAccountingSettingsForm((current) => ({
                                ...current,
                                savingGoal: {
                                  ...current.savingGoal!,
                                  availableBudgetYuan: sanitizeMoneyInput(event.target.value)
                                }
                              }))
                            }
                            placeholder="例如：1000"
                            value={accountingSettingsForm.savingGoal.availableBudgetYuan ?? ''}
                          />
                        </label>
                      </div>
                      <div className="form-grid">
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
                    <span>
                      <small>存钱进度</small>
                      <strong>{accountingData?.savingGoal?.progressPercent ?? 0}%</strong>
                    </span>
                    <span>
                      <small>剩余可用</small>
                      <strong>
                        {(accountingData?.savingGoal?.remainingAvailableCents ?? 0) >= 0
                          ? formatMoney(accountingData?.savingGoal?.remainingAvailableCents ?? 0)
                          : `超支 ${formatMoney(accountingData?.savingGoal?.overBudgetCents ?? 0)}`}
                      </strong>
                    </span>
                    <span>
                      <small>每日建议</small>
                      <strong>
                        {(accountingData?.savingGoal?.remainingAvailableCents ?? 0) >= 0
                          ? `最多 ${formatMoney(accountingData?.savingGoal?.dailyAvailableCents ?? 0)}`
                          : `补足 ${formatMoney(accountingData?.savingGoal?.dailyRequiredCents ?? 0)}`}
                      </strong>
                    </span>
                    <span>
                      <small>预计可存</small>
                      <strong>
                        {formatMoney(accountingData?.savingGoal?.projectedSavingCents ?? 0)}
                        {(accountingData?.savingGoal?.savingGapCents ?? 0) > 0
                          ? ` · 差 ${formatMoney(accountingData?.savingGoal?.savingGapCents ?? 0)}`
                          : ''}
                        {(accountingData?.savingGoal?.savingSurplusCents ?? 0) > 0
                          ? ` · 多 ${formatMoney(accountingData?.savingGoal?.savingSurplusCents ?? 0)}`
                          : ''}
                      </strong>
                    </span>
                  </div>
                </form>
              </section>
            </>
          )}
        </section>
      ) : mode === 'files' ? (
        <section className="files-page">
          {!adminToken ? (
            <form className="unlock-panel" onSubmit={unlockFiles}>
              <p className="eyebrow">Private Files</p>
              <h1>文件仓库</h1>
              <p>输入后台口令后上传文件、生成签名访问链接。文件不限类型，但上传、管理和链接生成都需要后台鉴权。</p>
              <input
                aria-label="文件仓库口令"
                onChange={(event) => setFilePassword(event.target.value)}
                placeholder="输入后台口令"
                type="password"
                value={filePassword}
              />
              <button type="submit">进入文件仓库</button>
            </form>
          ) : (
            <section className="files-layout">
              <div className="file-hero accounting-card">
                <div>
                  <p className="eyebrow">Signed Storage</p>
                  <h1>文件仓库</h1>
                  <p>上传后的文件默认不可公开访问，只有生成签名链接后才可被外部读取。删除文件会让旧链接立即失效。</p>
                </div>
                <button onClick={() => void loadFiles(adminToken, activeFileFolderId)} type="button">刷新列表</button>
              </div>

              <section className="file-toolbar accounting-card">
                <div className="file-breadcrumbs" aria-label="文件夹路径">
                  <button className={!activeFileFolderId ? 'active' : ''} onClick={() => openFileFolder('')} type="button">
                    根目录
                  </button>
                  {fileFolderView.breadcrumbs.map((folder) => (
                    <button
                      className={folder.id === activeFileFolderId ? 'active' : ''}
                      key={folder.id}
                      onClick={() => openFileFolder(folder.id)}
                      type="button"
                    >
                      {folder.name}
                    </button>
                  ))}
                </div>
                <button onClick={() => void createFolderInCurrentFolder()} type="button">新建文件夹</button>
              </section>

              {fileFolderView.folders.length ? (
                <section className="folder-grid" aria-label="文件夹">
                  {fileFolderView.folders.map((folder) => (
                    <div className="folder-item" key={folder.id}>
                      <button className="folder-open" onClick={() => openFileFolder(folder.id)} type="button">
                        <span className="folder-icon">DIR</span>
                        <span>
                          <strong>{folder.name}</strong>
                          <small>{new Date(folder.updatedAt).toLocaleString('zh-CN')}</small>
                        </span>
                      </button>
                      <div>
                        <button onClick={() => void renameFolderItem(folder)} type="button">重命名</button>
                        <button className="danger" onClick={() => void removeFolderItem(folder)} type="button">删除</button>
                      </div>
                    </div>
                  ))}
                </section>
              ) : null}

              <section
                className={fileDragActive ? 'file-dropzone active' : 'file-dropzone'}
                onDragLeave={() => setFileDragActive(false)}
                onDragOver={(event) => {
                  event.preventDefault();
                  setFileDragActive(true);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setFileDragActive(false);
                  void handleFileUpload(event.dataTransfer.files[0]);
                }}
              >
                <input
                  onChange={(event) => void handleFileUpload(event.target.files?.[0])}
                  ref={fileInputRef}
                  type="file"
                />
                <strong>拖拽文件到这里，或选择上传</strong>
                <span>不限文件类型，单文件大小受服务端 FILE_UPLOAD_LIMIT 控制。</span>
                <button disabled={uploadingFile} onClick={() => fileInputRef.current?.click()} type="button">
                  {uploadingFile ? '上传中...' : '选择文件'}
                </button>
              </section>

              {generatedFileLink ? (
                <div className="file-link-box">
                  <span>最近生成的签名链接</span>
                  <code>{generatedFileLink}</code>
                </div>
              ) : null}

              <section className="accounting-card file-list-panel">
                <div className="panel-heading">
                  <h2>当前目录文件 · {fileFolderView.files.length} 个</h2>
                </div>
                <div className="file-list">
                  {fileFolderView.files.map((file) => (
                    <div className="file-item" key={file.id}>
                      <span className="file-badge">FILE</span>
                      <span>
                        <strong>{file.originalName}</strong>
                        <small>{formatBytes(file.sizeBytes)} · {file.contentType} · {new Date(file.uploadedAt).toLocaleString('zh-CN')}</small>
                      </span>
                      <button onClick={() => void copyFileLink(file)} type="button">复制链接</button>
                      <button className="danger" onClick={() => void removeUploadedFile(file)} type="button">删除</button>
                    </div>
                  ))}
                  {fileFolderView.files.length === 0 ? (
                    <div className="empty-state">这个目录还没有文件。</div>
                  ) : null}
                </div>
              </section>
            </section>
          )}
        </section>
      ) : mode === 'images' ? (
        <section className="image-host-page">
          {!adminToken ? (
            <form className="unlock-panel" onSubmit={unlockImages}>
              <p className="eyebrow">Private Image Host</p>
              <h1>图床</h1>
              <p>输入后台口令后上传图片。这里只允许 PNG、JPG、GIF、WebP 图片，上传成功后会自动复制公开访问链接。</p>
              <input
                aria-label="图床口令"
                onChange={(event) => setImagePassword(event.target.value)}
                placeholder="输入后台口令"
                type="password"
                value={imagePassword}
              />
              <button type="submit">进入图床</button>
            </form>
          ) : (
            <section className="image-host-layout">
              <div className="file-hero accounting-card">
                <div>
                  <p className="eyebrow">Image Host</p>
                  <h1>图床</h1>
                  <p>上传成功后自动复制图片链接，可直接粘贴到 Markdown、报告或网页中使用。</p>
                </div>
                <button onClick={() => void loadHostedImages(adminToken)} type="button">刷新列表</button>
              </div>

              <section
                className={imageDragActive ? 'image-dropzone active' : 'image-dropzone'}
                onDragLeave={() => setImageDragActive(false)}
                onDragOver={(event) => {
                  event.preventDefault();
                  setImageDragActive(true);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setImageDragActive(false);
                  void handleHostedImageUpload(event.dataTransfer.files[0]);
                }}
              >
                <input
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  onChange={(event) => void handleHostedImageUpload(event.target.files?.[0])}
                  ref={imageHostInputRef}
                  type="file"
                />
                <strong>拖拽图片到这里，或选择上传</strong>
                <span>仅允许 PNG、JPG、GIF、WebP，上传需要后台鉴权。</span>
                <button disabled={uploadingImage} onClick={() => imageHostInputRef.current?.click()} type="button">
                  {uploadingImage ? '上传中...' : '选择图片'}
                </button>
              </section>

              {copiedImageLink ? (
                <div className="file-link-box">
                  <span>最近上传的图片链接</span>
                  <code>{copiedImageLink}</code>
                </div>
              ) : null}

              <section className="accounting-card image-list-panel">
                <div className="panel-heading">
                  <h2>图片列表 · {hostedImages.length} 张</h2>
                </div>
                <div className="image-grid">
                  {hostedImages.map((image) => {
                    const link = new URL(image.path, window.location.origin).toString();
                    return (
                      <div className="image-item" key={image.id}>
                        <img alt={image.originalName} src={image.path} {...safeImageAttributes} />
                        <div>
                          <strong>{image.originalName}</strong>
                          <small>{formatBytes(image.sizeBytes)} · {image.contentType}</small>
                          <code>{link}</code>
                        </div>
                        <button onClick={() => void copyHostedImageLink(image)} type="button">复制链接</button>
                        <button className="danger" onClick={() => void removeHostedImage(image)} type="button">删除</button>
                      </div>
                    );
                  })}
                  {hostedImages.length === 0 ? (
                    <div className="empty-state">还没有上传图片。</div>
                  ) : null}
                </div>
              </section>
            </section>
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
                <section className={adminPanelOpen.content ? 'admin-group open' : 'admin-group'}>
                  <div className="panel-heading">
                    <h2>内容管理</h2>
                    <button onClick={() => setAdminPanelOpen((current) => ({ ...current, content: !current.content }))} type="button">
                      {adminPanelOpen.content ? '收起' : '展开'}
                    </button>
                  </div>
                  {adminPanelOpen.content ? (
                    <>
                      <button className="ghost admin-create" onClick={startCreate} type="button">新建</button>
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
                      {adminPosts.map((post) => {
                        const category = getCategory(post.category);
                        const isPublished = post.status === 'published';
                        return (
                          <div className="admin-post" key={post.id}>
                            <button className="admin-post-main" onClick={() => startEdit(post)} type="button">
                              <span className="admin-post-title-row">
                                <strong>{post.title}</strong>
                                <em className={`status-badge ${isPublished ? 'published' : 'draft'}`}>
                                  {isPublished ? '已发布' : '草稿'}
                                </em>
                              </span>
                              <small>
                                <Icon name={getCategoryIcon(post.category)} />
                                {category.name}
                                <Icon name="calendar" />
                                {formatDateTime(post.updatedAt)}
                              </small>
                            </button>
                            <div className="admin-post-actions">
                              <button onClick={() => updateStatus(post.id, isPublished ? 'draft' : 'published')} type="button">
                                {isPublished ? '设草稿' : '发布'}
                              </button>
                              <button className="danger" onClick={() => removePost(post)} type="button">删除</button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  ) : null}
                </section>

                <section className={adminPanelOpen.users ? 'admin-group open' : 'admin-group'}>
                  <div className="panel-heading">
                    <h2>用户管理</h2>
                    <button onClick={() => setAdminPanelOpen((current) => ({ ...current, users: !current.users }))} type="button">
                      {adminPanelOpen.users ? '收起' : '展开'}
                    </button>
                  </div>
                  {adminPanelOpen.users ? (
                    <div className="admin-user-list">
                      <form className="admin-user admin-user-create" onSubmit={submitAdminUser}>
                        <input
                          onChange={(event) => setAdminUserForm((current) => ({ ...current, username: event.target.value }))}
                          placeholder="用户名"
                          value={adminUserForm.username}
                        />
                        <input
                          onChange={(event) => setAdminUserForm((current) => ({ ...current, password: event.target.value }))}
                          placeholder="初始密码"
                          type="password"
                          value={adminUserForm.password}
                        />
                        <input
                          onChange={(event) => setAdminUserForm((current) => ({ ...current, nickname: event.target.value }))}
                          placeholder="昵称"
                          value={adminUserForm.nickname}
                        />
                        <select
                          onChange={(event) => setAdminUserForm((current) => ({ ...current, permission: event.target.value as BlogUser['permission'] }))}
                          value={adminUserForm.permission}
                        >
                          <option value="reader">阅读用户</option>
                          <option value="admin">管理员</option>
                        </select>
                        <button type="submit">新增用户</button>
                      </form>
                      {adminUsers.map((user) => (
                        <div className="admin-user" key={user.id}>
                          <span className="admin-user-name">{user.username}</span>
                          <input
                            onChange={(event) => setAdminUsers((current) => current.map((item) => (
                              item.id === user.id ? { ...item, nickname: event.target.value } : item
                            )))}
                            placeholder="昵称"
                            value={user.nickname}
                          />
                          <select
                            onChange={(event) => setAdminUsers((current) => current.map((item) => (
                              item.id === user.id ? { ...item, permission: event.target.value as BlogUser['permission'] } : item
                            )))}
                            value={user.permission}
                          >
                            <option value="reader">阅读用户</option>
                            <option value="admin">管理员</option>
                          </select>
                          <button onClick={() => void saveAdminUser(user)} type="button">保存</button>
                          <button className="danger" onClick={() => void removeAdminUser(user)} type="button">删除</button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
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
                  <div className="cover-input-row">
                    <input
                      onChange={(event) => updateForm({ coverImage: event.target.value })}
                      placeholder="请输入 HTTPS 图片 URL，或粘贴本站图床链接"
                      value={form.coverImage ?? ''}
                    />
                    <input
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      className="hidden-input"
                      onChange={(event) => void uploadCoverImageFile(event.target.files?.[0])}
                      ref={coverImageInputRef}
                      type="file"
                    />
                    <button disabled={uploadingImage} onClick={() => coverImageInputRef.current?.click()} type="button">
                      {uploadingImage ? '上传中' : '上传封面'}
                    </button>
                  </div>
                </label>
                <label>
                  标签
                  <input
                    onChange={(event) => updateTagInput(event.target.value)}
                    placeholder="用逗号分隔标签"
                    value={tagInput}
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
                      <input
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        className="hidden-input"
                        onChange={(event) => void insertImageFile(event.target.files?.[0])}
                        ref={imageInputRef}
                        type="file"
                      />
                      <button aria-label="一级标题" onClick={() => insertMarkdownSnippet('# ')} title="一级标题" type="button">H1</button>
                      <button aria-label="二级标题" onClick={() => insertMarkdownSnippet('## ')} title="二级标题" type="button">H2</button>
                      <button aria-label="粗体" onClick={() => insertMarkdownSnippet('**', '**')} title="粗体" type="button">B</button>
                      <button aria-label="行内代码" onClick={() => insertMarkdownSnippet('`', '`', 'code')} title="行内代码" type="button">&lt;/&gt;</button>
                      <button aria-label="引用" onClick={() => insertMarkdownSnippet('> ')} title="引用" type="button">“”</button>
                      <button aria-label="列表" onClick={() => insertMarkdownSnippet('- ')} title="列表" type="button">•</button>
                      <button aria-label="链接" onClick={() => insertMarkdownSnippet('[', '](https://example.com)', '链接文字')} title="链接" type="button">↗</button>
                      <button aria-label="代码块" onClick={() => insertMarkdownSnippet('```bash\n', '\n```', 'npm run build')} title="代码块" type="button">▣</button>
                      <button aria-label="上传图片" disabled={uploadingImage} onClick={() => imageInputRef.current?.click()} title="上传图片" type="button">
                        {uploadingImage ? '...' : 'IMG'}
                      </button>
                    </div>
                    <label>
                      正文
                      <textarea
                        className="content-editor"
                        onChange={(event) => updateForm({ content: event.target.value })}
                        onPaste={pasteImageIntoEditor}
                        placeholder="支持 Markdown：标题、粗体、行内代码、链接、引用、列表、代码块、图片。"
                        ref={contentEditorRef}
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
