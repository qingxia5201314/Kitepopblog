import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
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
import { createBlogRepository } from './lib/blogStore';
import { createDraftAutosaveRepository } from './lib/draftAutosave';
import {
  UploadedImage,
  buildImageMarkdown,
  createImageHostSettingsRepository,
  normalizeImageUrl,
  normalizeUploadUrl,
  uploadToImageHost
} from './lib/imageHost';
import { MarkdownBlock, parseMarkdown } from './lib/markdown';

type ViewMode = 'home' | 'admin';
type EditorTab = 'edit' | 'preview';
type AdminStatusFilter = 'all' | PostStatus;
type UiIcon = ReturnType<typeof getCategoryIcon> | 'calendar' | 'clock' | 'tag' | 'spark' | 'grid' | 'draft' | 'edit';

const safeImageAttributes = {
  decoding: 'async',
  loading: 'lazy',
  referrerPolicy: 'no-referrer'
} as const;

const repository = createBlogRepository();
const draftRepository = createDraftAutosaveRepository();
const imageSettingsRepository = createImageHostSettingsRepository();

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
  const [posts, setPosts] = useState<BlogPost[]>(() => repository.list());
  const [mode, setMode] = useState<ViewMode>('home');
  const [activeCategory, setActiveCategory] = useState<BlogCategoryId | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BlogPostDraft>(() => draftRepository.load() ?? EMPTY_FORM);
  const [editorTab, setEditorTab] = useState<EditorTab>('edit');
  const [adminStatusFilter, setAdminStatusFilter] = useState<AdminStatusFilter>('all');
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [imageSettings, setImageSettings] = useState(() => imageSettingsRepository.load());
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [imageAlt, setImageAlt] = useState('Kitepop 图片');
  const [manualImageUrl, setManualImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);

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

  useEffect(() => {
    if (!adminUnlocked || editingId) return;

    const hasDraftContent =
      form.title.trim() || form.summary.trim() || form.content.trim() || form.tags.length > 0 || form.coverImage;

    if (hasDraftContent) {
      draftRepository.save(form);
      setNotice('草稿已自动保存到本地浏览器');
    }
  }, [adminUnlocked, editingId, form]);

  const refresh = () => setPosts(repository.list());

  const updateForm = (patch: Partial<BlogPostDraft>) => {
    setForm((current) => ({ ...current, ...patch }));
    setFormError('');
  };

  const startCreate = () => {
    setEditingId(null);
    setForm(draftRepository.load() ?? EMPTY_FORM);
    setEditorTab('edit');
    setNotice('已进入新建文章模式');
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
      cover: post.cover,
      coverImage: post.coverImage ?? ''
    });
    setEditorTab('edit');
    setNotice(`正在编辑：${post.title}`);
  };

  const savePost = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.title.trim()) {
      setFormError('请填写文章标题');
      return;
    }

    if (!form.summary.trim()) {
      setFormError('请填写文章摘要');
      return;
    }

    if (!form.content.trim()) {
      setFormError('请填写文章正文');
      return;
    }

    const coverImageInput = form.coverImage?.trim() ?? '';
    const coverImage = coverImageInput ? normalizeImageUrl(coverImageInput) : '';

    if (coverImageInput && !coverImage) {
      setFormError('请输入 HTTPS 封面图片 URL（本地调试允许 localhost HTTP）');
      return;
    }

    const payload = {
      ...form,
      cover: form.category,
      coverImage
    };

    const saved = editingId ? repository.update(editingId, payload) : repository.create(payload);
    refresh();

    if (saved) {
      setSelectedPostId(saved.id);
      setActiveCategory(saved.category);
      setNotice(saved.status === 'published' ? '文章已保存并发布' : '文章已保存为草稿');
      draftRepository.clear();
      startEdit(saved);
    }
  };

  const removePost = (post: BlogPost) => {
    const confirmed = window.confirm(`确认删除《${post.title}》吗？这个操作不能撤销。`);
    if (!confirmed) return;

    repository.remove(post.id);
    refresh();
    setNotice('文章已删除');
    if (selectedPostId === post.id) setSelectedPostId(null);
    if (editingId === post.id) startCreate();
  };

  const updateStatus = (id: string, status: PostStatus) => {
    const updated = repository.update(id, { status });
    refresh();
    if (updated && editingId === id) startEdit(updated);
    setNotice(status === 'published' ? '文章已发布' : '文章已转为草稿');
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
      const result = (await response.json()) as { ok?: boolean; message?: string };

      if (!response.ok || !result.ok) {
        setFormError(result.message || '后台口令不正确');
        return;
      }

      setAdminUnlocked(true);
      setPassword('');
      setNotice('已进入后台');
    } catch {
      setFormError('无法连接后台登录接口');
    }
  };

  const saveImageSettings = () => {
    if (!normalizeUploadUrl(imageSettings.uploadUrl)) {
      setFormError('请输入 HTTPS 图床上传接口（本地调试允许 localhost HTTP）');
      return;
    }

    imageSettingsRepository.save(imageSettings);
    setNotice('图床设置已保存到本地浏览器');
  };

  const insertImage = (image: UploadedImage, asCover = false) => {
    const imageUrl = normalizeImageUrl(image.url);

    if (!imageUrl) {
      setFormError('请输入 HTTPS 图片 URL（本地调试允许 localhost HTTP）');
      return;
    }

    const markdown = buildImageMarkdown(imageAlt, imageUrl);
    const nextContent = form.content.trim() ? `${form.content}\n\n${markdown}` : markdown;
    updateForm({
      content: nextContent,
      coverImage: asCover ? imageUrl : form.coverImage
    });
    setNotice(asCover ? '图片已插入正文并设为封面' : '图片已插入正文');
  };

  const insertMarkdownSnippet = (before: string, after = '', placeholder = '内容') => {
    const snippet = `${before}${placeholder}${after}`;
    const nextContent = form.content.trim() ? `${form.content}\n\n${snippet}` : snippet;
    updateForm({ content: nextContent });
    setNotice('Markdown 片段已插入正文');
  };

  const insertManualImage = () => {
    const url = normalizeImageUrl(manualImageUrl);

    if (!url) {
      setFormError('请输入 HTTPS 图片 URL（本地调试允许 localhost HTTP）');
      return;
    }

    insertImage({ url, filename: url.split('/').pop() ?? 'image' });
    setManualImageUrl('');
  };

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setFormError('');

    try {
      const image = await uploadToImageHost(file, imageSettings);
      setUploadedImages((current) => [image, ...current]);
      insertImage(image);
      setNotice('图片上传成功');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '图片上传失败');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setNotice('已复制到剪贴板');
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
                这里沉淀个人生活、SRC 挖掘案例、专业学习和知识点记录。后台支持图床上传、封面图和图文发布。
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
              {formError ? <p className="form-message error">{formError}</p> : null}
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
                {notice ? <p className="form-message">{notice}</p> : null}
                {formError ? <p className="form-message error">{formError}</p> : null}

                <section className="tool-panel">
                  <div className="panel-heading">
                    <h3>图床设置</h3>
                    <button onClick={saveImageSettings} type="button">保存设置</button>
                  </div>
                  <div className="form-grid">
                    <label>
                      图床类型
                      <select
                        onChange={(event) => setImageSettings({ ...imageSettings, provider: event.target.value as 'custom' })}
                        value={imageSettings.provider}
                      >
                        <option value="custom">自定义接口 / SM.MS</option>
                      </select>
                    </label>
                    <label>
                      Token / Authorization
                      <input
                        onChange={(event) => setImageSettings({ ...imageSettings, token: event.target.value })}
                        placeholder="例如 SM.MS Token，只保存在本地浏览器"
                        type="password"
                        value={imageSettings.token}
                      />
                    </label>
                    <label>
                      上传接口 URL
                      <input
                        onChange={(event) => setImageSettings({ ...imageSettings, uploadUrl: event.target.value })}
                        placeholder="https://sm.ms/api/v2/upload"
                        value={imageSettings.uploadUrl}
                      />
                    </label>
                    <label>
                      文件字段名
                      <input
                        onChange={(event) => setImageSettings({ ...imageSettings, fileFieldName: event.target.value })}
                        placeholder="smfile / file / image"
                        value={imageSettings.fileFieldName}
                      />
                    </label>
                    <label>
                      返回 URL 路径
                      <input
                        onChange={(event) => setImageSettings({ ...imageSettings, urlPath: event.target.value })}
                        placeholder="data.url / result.url"
                        value={imageSettings.urlPath}
                      />
                    </label>
                  </div>
                  <div className="image-tools">
                    <label className="file-picker">
                      {uploading ? '上传中...' : '上传图片'}
                      <input accept="image/*" disabled={uploading} onChange={uploadImage} type="file" />
                    </label>
                    <input
                      onChange={(event) => setImageAlt(event.target.value)}
                      placeholder="图片描述"
                      value={imageAlt}
                    />
                    <input
                      onChange={(event) => setManualImageUrl(event.target.value)}
                      placeholder="手动输入图片 URL"
                      value={manualImageUrl}
                    />
                    <button onClick={insertManualImage} type="button">插入 URL</button>
                  </div>
                  {uploadedImages.length > 0 ? (
                    <div className="upload-list">
                      {uploadedImages.map((image) => (
                        <div className="upload-item" key={image.url}>
                          <img alt={image.filename} src={image.url} {...safeImageAttributes} />
                          <span>{image.filename}</span>
                          <button onClick={() => insertImage(image)} type="button">插入</button>
                          <button onClick={() => insertImage(image, true)} type="button">设封面</button>
                          <button onClick={() => copyText(image.url)} type="button">复制 URL</button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>

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
                    placeholder="可由图床上传后自动填入"
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
