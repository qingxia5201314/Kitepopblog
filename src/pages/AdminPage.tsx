import React, { useState, useRef, useEffect, FormEvent, ClipboardEvent } from 'react';
import { useApp } from '../context/AppContext';
import { useEditor } from '../hooks/useEditor';
import {
  BLOG_CATEGORIES,
  BlogCategoryId,
  BlogPost,
  BlogUser,
  PostStatus,
  getCategory,
  getCategoryIcon
} from '../lib/blog';
import { formatTagInput, parseTagInput } from '../lib/tags';
import {
  createPost,
  createUser,
  deletePost,
  deleteUser,
  listUsers,
  updatePost,
  updateUser
} from '../lib/blogApi';
import {
  createDraftAutosaveRepository
} from '../lib/draftAutosave';
import { normalizeImageUrl } from '../lib/imageUrl';
import { createMarkdownImageBlock, getFirstClipboardImage, insertAtSelection } from '../lib/markdownInsert';
import { uploadHostedImage } from '../lib/imageApi';
import {
  Icon,
  renderMarkdown,
  safeImageAttributes
} from '../components/shared';

const draftRepository = createDraftAutosaveRepository();

const EMPTY_FORM = {
  title: '',
  summary: '',
  category: 'life' as BlogCategoryId,
  tags: [] as string[],
  content: '',
  status: 'draft' as PostStatus,
  cover: 'life' as BlogCategoryId,
  coverImage: ''
};

const EMPTY_ADMIN_USER_FORM = {
  username: '',
  password: '',
  nickname: '',
  permission: 'reader' as BlogUser['permission']
};

export function AdminPage() {
  const { notify, adminToken, posts, loadPosts } = useApp();
  const [adminUnlocked, setAdminUnlocked] = useState(!!adminToken);
  const [localAdminToken, setLocalAdminToken] = useState(adminToken);
  const [password, setPassword] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [tagInput, setTagInput] = useState('');
  const [editorTab, setEditorTab] = useState<'edit' | 'preview'>('edit');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [adminStatusFilter, setAdminStatusFilter] = useState<'all' | PostStatus>('all');
  const [expandedAdminPostId, setExpandedAdminPostId] = useState<string | null>(null);
  const [adminPanelOpen, setAdminPanelOpen] = useState({ content: false, users: false });
  const [adminUsers, setAdminUsers] = useState<BlogUser[]>([]);
  const [adminUserForm, setAdminUserForm] = useState(EMPTY_ADMIN_USER_FORM);
  const [autosaveNote, setAutosaveNote] = useState('');

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const coverImageInputRef = useRef<HTMLInputElement | null>(null);
  const contentEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const loadedAdminUsersTokenRef = useRef('');

  const adminPosts = posts.filter((post) => adminStatusFilter === 'all' || post.status === adminStatusFilter);
  const formCoverImage = form.coverImage ? normalizeImageUrl(form.coverImage) : undefined;

  const handleUnlockAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const result = (await response.json()) as { ok?: boolean; message?: string; token?: string; expiresAt?: string };

      if (!response.ok || !result.ok || !result.token) {
        notify('error', result.message || '后台口令不正确');
        return;
      }

      setAdminUnlocked(true);
      setLocalAdminToken(result.token);
      window.localStorage.setItem('kitepop-admin-session', JSON.stringify({ token: result.token, expiresAt: result.expiresAt }));
      setPassword('');
      await loadPosts(true, result.token);
      await loadAdminUsers(result.token);
      notify('success', '已进入后台');
    } catch {
      notify('error', '无法连接后台登录接口');
    }
  };

  const loadAdminUsers = async (token = localAdminToken) => {
    if (!token) return;
    try {
      const users = await listUsers(token);
      setAdminUsers(users);
      loadedAdminUsersTokenRef.current = token;
    } catch (error) {
      if (loadedAdminUsersTokenRef.current === token) loadedAdminUsersTokenRef.current = '';
      notify('error', error instanceof Error ? error.message : '用户列表加载失败');
    }
  };

  useEffect(() => {
    if (!adminToken || adminToken === localAdminToken) return;
    setLocalAdminToken(adminToken);
    setAdminUnlocked(true);
  }, [adminToken, localAdminToken]);

  useEffect(() => {
    if (!adminUnlocked || !localAdminToken || loadedAdminUsersTokenRef.current === localAdminToken) return;
    loadedAdminUsersTokenRef.current = localAdminToken;
    void loadAdminUsers(localAdminToken);
  }, [adminUnlocked, localAdminToken]);

  const updateForm = (patch: Partial<typeof EMPTY_FORM>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const updateTagInput = (value: string) => {
    setTagInput(value);
    updateForm({ tags: parseTagInput(value) });
  };

  const startCreate = () => {
    const draft = draftRepository.load() ?? EMPTY_FORM;
    setEditingId(null);
    setForm({
      ...draft,
      coverImage: draft.coverImage || ''
    });
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
      coverImage: post.coverImage || ''
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
      title: form.title,
      summary: form.summary,
      category: form.category,
      tags: parseTagInput(tagInput),
      content: form.content,
      status: form.status,
      cover: form.category,
      coverImage: coverImage || ''
    };

    try {
      const saved = editingId
        ? await updatePost(editingId, payload, localAdminToken)
        : await createPost(payload, localAdminToken);
      await loadPosts(true, localAdminToken);
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
      await deletePost(post.id, localAdminToken);
      await loadPosts(true, localAdminToken);
      notify('success', '文章已删除');
      if (editingId === post.id) startCreate();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文章删除失败');
    }
  };

  const updateStatus = async (id: string, status: PostStatus) => {
    try {
      const updated = await updatePost(id, { status }, localAdminToken);
      await loadPosts(true, localAdminToken);
      if (updated && editingId === id) startEdit(updated, false);
      notify('success', status === 'published' ? '文章已发布' : '文章已转为草稿');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '状态更新失败');
    }
  };

  const saveAdminUser = async (user: BlogUser) => {
    try {
      const updated = await updateUser(user.id, user, localAdminToken);
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
      const user = await createUser(adminUserForm, localAdminToken);
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
      await deleteUser(user.id, localAdminToken);
      setAdminUsers((current) => current.filter((item) => item.id !== user.id));
      notify('success', '用户已删除');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '用户删除失败');
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
    if (!localAdminToken) {
      notify('error', '请先进入后台再上传图片');
      return;
    }
    if (!file.type.startsWith('image/')) {
      notify('error', '只能上传图片文件');
      return;
    }

    setUploadingImage(true);
    try {
      const image = await uploadHostedImage(file, localAdminToken);
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
    if (!localAdminToken) {
      notify('error', '请先进入后台再上传封面');
      return;
    }
    if (!file.type.startsWith('image/')) {
      notify('error', '只能上传图片文件');
      return;
    }

    setUploadingImage(true);
    try {
      const image = await uploadHostedImage(file, localAdminToken);
      updateForm({ coverImage: image.path });
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

  if (!adminUnlocked) {
    return (
      <section className="admin-layout">
        <form className="unlock-panel" onSubmit={handleUnlockAdmin}>
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
      </section>
    );
  }

  return (
    <section className="admin-layout">
      <aside className="admin-list">
        <section className={adminPanelOpen.content ? 'admin-group admin-content-group open' : 'admin-group admin-content-group'}>
          <div className="panel-heading">
            <h2>内容管理</h2>
            <button
              onClick={() => setAdminPanelOpen((current) => ({ ...current, content: !current.content }))}
              type="button"
            >
              {adminPanelOpen.content ? '收起' : '展开'}
            </button>
          </div>
          {adminPanelOpen.content ? (
            <>
              <button className="ghost admin-create" onClick={startCreate} type="button">
                新建
              </button>
              <div className="segmented-control">
                {(['all', 'published', 'draft'] as const).map((status) => (
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
                const isExpanded = expandedAdminPostId === post.id;
                return (
                  <div className={isExpanded ? 'admin-post is-expanded' : 'admin-post'} key={post.id}>
                    <button
                      aria-expanded={isExpanded}
                      className="admin-post-main"
                      onClick={() => setExpandedAdminPostId((current) => (current === post.id ? null : post.id))}
                      type="button"
                    >
                      <span className="admin-post-title-row">
                        <strong>{post.title}</strong>
                        <em className={`status-badge ${isPublished ? 'published' : 'draft'}`}>
                          {isPublished ? '已发布' : '草稿'}
                        </em>
                      </span>
                      <small>
                        <Icon name={getCategoryIcon(post.category)} />
                        {category.name}
                        <span className="admin-post-meta-sep">·</span>
                        {new Date(post.updatedAt).toLocaleString('zh-CN')}
                      </small>
                    </button>
                    {isExpanded ? (
                      <div className="admin-post-actions">
                        <button onClick={() => startEdit(post)} type="button">
                          编辑
                        </button>
                        <button onClick={() => updateStatus(post.id, isPublished ? 'draft' : 'published')} type="button">
                          {isPublished ? '设草稿' : '发布'}
                        </button>
                        <button className="danger" onClick={() => removePost(post)} type="button">
                          删除
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </>
          ) : null}
        </section>

        <section className={adminPanelOpen.users ? 'admin-group admin-user-group open' : 'admin-group admin-user-group'}>
          <div className="panel-heading">
            <h2>用户管理</h2>
            <button
              onClick={() => setAdminPanelOpen((current) => ({ ...current, users: !current.users }))}
              type="button"
            >
              {adminPanelOpen.users ? '收起' : '展开'}
            </button>
          </div>
          {adminPanelOpen.users ? (
            <div className="admin-user-list">
              <form className="admin-user admin-user-create" onSubmit={submitAdminUser}>
                <input
                  onChange={(event) =>
                    setAdminUserForm((current) => ({ ...current, username: event.target.value }))
                  }
                  placeholder="用户名"
                  value={adminUserForm.username}
                />
                <input
                  onChange={(event) =>
                    setAdminUserForm((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder="初始密码"
                  type="password"
                  value={adminUserForm.password}
                />
                <input
                  onChange={(event) =>
                    setAdminUserForm((current) => ({ ...current, nickname: event.target.value }))
                  }
                  placeholder="昵称"
                  value={adminUserForm.nickname}
                />
                <select
                  onChange={(event) =>
                    setAdminUserForm((current) => ({
                      ...current,
                      permission: event.target.value as BlogUser['permission']
                    }))
                  }
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
                    onChange={(event) =>
                      setAdminUsers((current) =>
                        current.map((item) =>
                          item.id === user.id ? { ...item, nickname: event.target.value } : item
                        )
                      )
                    }
                    placeholder="昵称"
                    value={user.nickname}
                  />
                  <select
                    onChange={(event) =>
                      setAdminUsers((current) =>
                        current.map((item) =>
                          item.id === user.id
                            ? { ...item, permission: event.target.value as BlogUser['permission'] }
                            : item
                        )
                      )
                    }
                    value={user.permission}
                  >
                    <option value="reader">阅读用户</option>
                    <option value="admin">管理员</option>
                  </select>
                  <button onClick={() => saveAdminUser(user)} type="button">
                    保存
                  </button>
                  <button className="danger" onClick={() => removeAdminUser(user)} type="button">
                    删除
                  </button>
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
              onChange={(event) =>
                updateForm({ category: event.target.value as BlogCategoryId, cover: event.target.value as BlogCategoryId })
              }
              value={form.category}
            >
              {BLOG_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            状态
            <select onChange={(event) => updateForm({ status: event.target.value as PostStatus })} value={form.status}>
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
              onChange={(event) => uploadCoverImageFile(event.target.files?.[0])}
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
                onChange={(event) => insertImageFile(event.target.files?.[0])}
                ref={imageInputRef}
                type="file"
              />
              <button aria-label="一级标题" onClick={() => insertMarkdownSnippet('# ')} title="一级标题" type="button">
                H1
              </button>
              <button aria-label="二级标题" onClick={() => insertMarkdownSnippet('## ')} title="二级标题" type="button">
                H2
              </button>
              <button aria-label="粗体" onClick={() => insertMarkdownSnippet('**', '**')} title="粗体" type="button">
                B
              </button>
              <button
                aria-label="行内代码"
                onClick={() => insertMarkdownSnippet('`', '`', 'code')}
                title="行内代码"
                type="button"
              >
                &lt;/&gt;
              </button>
              <button aria-label="引用" onClick={() => insertMarkdownSnippet('> ')} title="引用" type="button">
                ""
              </button>
              <button aria-label="列表" onClick={() => insertMarkdownSnippet('- ')} title="列表" type="button">
                •
              </button>
              <button
                aria-label="链接"
                onClick={() => insertMarkdownSnippet('[', '](https://example.com)', '链接文字')}
                title="链接"
                type="button"
              >
                ↗
              </button>
              <button
                aria-label="代码块"
                onClick={() => insertMarkdownSnippet('```bash\n', '\n```', 'npm run build')}
                title="代码块"
                type="button"
              >
                ▣
              </button>
              <button
                aria-label="行内公式"
                onClick={() => insertMarkdownSnippet('$', '$', 'E = mc^2')}
                title="行内公式"
                type="button"
              >
                ∑
              </button>
              <button
                aria-label="块级公式"
                onClick={() => insertMarkdownSnippet('$$\n', '\n$$', '\\frac{a}{b}')}
                title="块级公式"
                type="button"
              >
                ∫
              </button>
              <button
                aria-label="上传图片"
                disabled={uploadingImage}
                onClick={() => imageInputRef.current?.click()}
                title="上传图片"
                type="button"
              >
                {uploadingImage ? '...' : 'IMG'}
              </button>
            </div>
            <label>
              正文
              <textarea
                className="content-editor"
                onChange={(event) => updateForm({ content: event.target.value })}
                onPaste={pasteImageIntoEditor}
                placeholder="支持 Markdown：标题、粗体、行内代码、链接、引用、列表、代码块、图片、行内公式和块级公式。"
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
    </section>
  );
}
