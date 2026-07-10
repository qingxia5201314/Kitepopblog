import React, { ClipboardEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArticleManager } from '../components/admin/ArticleManager';
import { EditorPanel } from '../components/admin/EditorPanel';
import { UserManager } from '../components/admin/UserManager';
import { useApp } from '../context/AppContext';
import { useBlogData } from '../context/BlogDataContext';
import { useAdminAccess } from '../hooks/useAdminAccess';
import { ArticleAutosaveDraft, BlogCategoryId, BlogPost, BlogUser, PostStatus } from '../lib/blog';
import {
  clearArticleAutosaveDraft,
  createPost,
  createUser,
  deletePost,
  deleteUser,
  getArticleAutosaveDraft,
  listUsers,
  saveArticleAutosaveDraft,
  updatePost,
  updateUser
} from '../lib/blogApi';
import { createDraftAutosaveRepository } from '../lib/draftAutosave';
import { normalizeImageUrl } from '../lib/imageUrl';
import { uploadHostedImage } from '../lib/imageApi';
import { createMarkdownImageBlock, getFirstClipboardImage, insertAtSelection } from '../lib/markdownInsert';
import { formatTagInput, parseTagInput } from '../lib/tags';

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

function hasDraftContent(draft: typeof EMPTY_FORM) {
  return Boolean(
    draft.title.trim() ||
      draft.summary.trim() ||
      draft.content.trim() ||
      draft.tags.length > 0 ||
      draft.coverImage.trim()
  );
}

export function AdminPage() {
  const [searchParams] = useSearchParams();
  const { notify, adminToken } = useApp();
  const { posts, loadPosts } = useBlogData();
  const { password, setPassword, unlockAdmin } = useAdminAccess('已进入后台', '无法连接后台登录接口');

  const [adminUnlocked, setAdminUnlocked] = useState(Boolean(adminToken));
  const [localAdminToken, setLocalAdminToken] = useState(adminToken);
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
  const [serverDraft, setServerDraft] = useState<ArticleAutosaveDraft | null>(null);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const coverImageInputRef = useRef<HTMLInputElement | null>(null);
  const contentEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const loadedAdminUsersTokenRef = useRef('');
  const handledEditQueryRef = useRef('');
  const formRef = useRef(form);
  const tagInputRef = useRef(tagInput);
  const editingIdRef = useRef(editingId);
  const localAdminTokenRef = useRef(localAdminToken);

  const adminPosts = posts.filter((post) => adminStatusFilter === 'all' || post.status === adminStatusFilter);
  const editPostQuery = searchParams.get('edit');

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

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    tagInputRef.current = tagInput;
  }, [tagInput]);

  useEffect(() => {
    editingIdRef.current = editingId;
  }, [editingId]);

  useEffect(() => {
    localAdminTokenRef.current = localAdminToken;
  }, [localAdminToken]);

  useEffect(() => {
    if (!adminUnlocked || !localAdminToken) return;
    let cancelled = false;
    void getArticleAutosaveDraft(localAdminToken)
      .then((draft) => {
        if (!cancelled) setServerDraft(draft);
      })
      .catch(() => {
        if (!cancelled) setServerDraft(null);
      });
    return () => {
      cancelled = true;
    };
  }, [adminUnlocked, localAdminToken]);

  useEffect(() => {
    if (!adminUnlocked || !localAdminToken) {
      setAutosaveNote('');
      return;
    }

    let remainingSeconds = 10;
    let disposed = false;

    const saveCurrentDraft = async () => {
      const token = localAdminTokenRef.current;
      const currentDraft = {
        ...formRef.current,
        tags: parseTagInput(tagInputRef.current)
      };
      if (!token || !hasDraftContent(currentDraft)) return;

      try {
        const saved = await saveArticleAutosaveDraft(
          {
            editingId: editingIdRef.current,
            draft: currentDraft
          },
          token
        );
        draftRepository.save(currentDraft);
        if (!disposed) setServerDraft(saved);
      } catch (error) {
        console.warn('Article autosave failed', error);
      }
    };

    setAutosaveNote(`${remainingSeconds}s后自动保存文章`);
    const timer = window.setInterval(() => {
      remainingSeconds -= 1;
      if (remainingSeconds <= 0) {
        void saveCurrentDraft();
        remainingSeconds = 10;
      }
      setAutosaveNote(`${remainingSeconds}s后自动保存文章`);
    }, 1000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [adminUnlocked, localAdminToken]);

  const handleUnlockAdmin = async (event: FormEvent<HTMLFormElement>) => {
    const session = await unlockAdmin(event);
    if (!session?.token) return;
    setAdminUnlocked(true);
    setLocalAdminToken(session.token);
    await loadPosts(true, session.token);
    await loadAdminUsers(session.token);
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

  const updateForm = (patch: Partial<typeof EMPTY_FORM>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const updateTagInput = (value: string) => {
    setTagInput(value);
    updateForm({ tags: parseTagInput(value) });
  };

  const startCreate = () => {
    const draft = serverDraft?.editingId ? draftRepository.load() ?? EMPTY_FORM : serverDraft?.draft ?? draftRepository.load() ?? EMPTY_FORM;
    setEditingId(null);
    setForm({ ...draft, coverImage: draft.coverImage || '' });
    setTagInput(formatTagInput(draft.tags));
    setEditorTab('edit');
    notify('info', '已进入新建文章模式');
  };

  const startEdit = (post: BlogPost, showNotice = true) => {
    const savedDraft = serverDraft?.editingId === post.id ? serverDraft.draft : null;
    setEditingId(post.id);
    setForm({
      title: savedDraft?.title ?? post.title,
      summary: savedDraft?.summary ?? post.summary,
      category: savedDraft?.category ?? post.category,
      tags: savedDraft?.tags ?? post.tags,
      content: savedDraft?.content ?? post.content,
      status: savedDraft?.status ?? post.status,
      cover: savedDraft?.cover ?? post.cover,
      coverImage: savedDraft?.coverImage ?? post.coverImage ?? ''
    });
    setTagInput(formatTagInput(savedDraft?.tags ?? post.tags));
    setEditorTab('edit');
    if (showNotice) notify('info', `正在编辑：${post.title}`);
  };

  useEffect(() => {
    if (!adminUnlocked || !editPostQuery) return;
    const post = posts.find((item) => item.id === editPostQuery || item.slug === editPostQuery);
    if (!post) return;

    const queryKey = `${editPostQuery}:${post.updatedAt}`;
    if (handledEditQueryRef.current === queryKey && editingId === post.id) return;
    handledEditQueryRef.current = queryKey;

    setAdminPanelOpen((current) => ({ ...current, content: true }));
    setAdminStatusFilter('all');
    setExpandedAdminPostId(post.id);
    startEdit(post);
    window.setTimeout(() => {
      const editorPanel = document.querySelector('.editor-panel') as HTMLElement | null;
      editorPanel?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, [adminUnlocked, editPostQuery, editingId, posts]);

  const savePost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim()) return notify('error', '请填写文章标题');
    if (!form.summary.trim()) return notify('error', '请填写文章摘要');
    if (!form.content.trim()) return notify('error', '请填写文章正文');

    const coverImageInput = form.coverImage?.trim() ?? '';
    const coverImage = coverImageInput ? normalizeImageUrl(coverImageInput) : '';
    if (coverImageInput && !coverImage) {
      notify('error', '请输入 HTTPS 图片 URL，或使用本站图床链接');
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
      const saved = editingId ? await updatePost(editingId, payload, localAdminToken) : await createPost(payload, localAdminToken);
      await loadPosts(true, localAdminToken);
      notify('success', saved.status === 'published' ? '文章已保存并发布' : '文章已保存为草稿');
      draftRepository.clear();
      await clearArticleAutosaveDraft(localAdminToken).catch(() => undefined);
      setServerDraft(null);
      setAutosaveNote('');
      startEdit(saved, false);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文章保存失败');
    }
  };

  const removePost = async (post: BlogPost) => {
    const confirmed = window.confirm(`确认删除《${post.title}》吗？此操作不可撤销。`);
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
    if (!window.confirm(`确认删除用户 ${user.username} 吗？`)) return;
    try {
      await deleteUser(user.id, localAdminToken);
      setAdminUsers((current) => current.filter((item) => item.id !== user.id));
      notify('success', '用户已删除');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '用户删除失败');
    }
  };

  const updateAdminUser = (userId: string, patch: Partial<Pick<BlogUser, 'nickname' | 'permission'>>) => {
    setAdminUsers((current) => current.map((item) => (item.id === userId ? { ...item, ...patch } : item)));
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
    notify('info', '已插入 Markdown 片段');
  };

  const insertImageFile = async (file?: File, selectionStart?: number, selectionEnd?: number) => {
    if (!file) return;
    if (!localAdminToken) return notify('error', '请先进入后台再上传图片');
    if (!file.type.startsWith('image/')) return notify('error', '只能上传图片文件');
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
    if (!localAdminToken) return notify('error', '请先进入后台再上传封面');
    if (!file.type.startsWith('image/')) return notify('error', '只能上传图片文件');
    setUploadingImage(true);
    try {
      const image = await uploadHostedImage(file, localAdminToken);
      updateForm({ coverImage: image.path });
      notify('success', '封面已上传并填入');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '封面上传失败');
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
          <p>输入后台口令后，可以新增、编辑、删除文章，并管理草稿和用户。</p>
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
        <ArticleManager
          adminPanelOpen={adminPanelOpen.content}
          adminPosts={adminPosts}
          adminStatusFilter={adminStatusFilter}
          expandedAdminPostId={expandedAdminPostId}
          onCreate={startCreate}
          onEdit={startEdit}
          onRemove={removePost}
          onSetStatusFilter={setAdminStatusFilter}
          onToggleExpandedPost={(postId) => setExpandedAdminPostId((current) => (current === postId ? null : postId))}
          onTogglePanel={() => setAdminPanelOpen((current) => ({ ...current, content: !current.content }))}
          onUpdateStatus={updateStatus}
        />
        <UserManager
          adminPanelOpen={adminPanelOpen.users}
          adminUserForm={adminUserForm}
          adminUsers={adminUsers}
          onChangeCreateForm={(patch) => setAdminUserForm((current) => ({ ...current, ...patch }))}
          onChangeUser={updateAdminUser}
          onRemoveUser={removeAdminUser}
          onSaveUser={saveAdminUser}
          onSubmit={submitAdminUser}
          onTogglePanel={() => setAdminPanelOpen((current) => ({ ...current, users: !current.users }))}
        />
      </aside>

      <EditorPanel
        autosaveNote={autosaveNote}
        contentEditorRef={contentEditorRef}
        coverImageInputRef={coverImageInputRef}
        editorTab={editorTab}
        editingId={editingId}
        form={form}
        imageInputRef={imageInputRef}
        onInsertImage={(file) => void insertImageFile(file)}
        onInsertSnippet={insertMarkdownSnippet}
        onPasteImage={pasteImageIntoEditor}
        onSetEditorTab={setEditorTab}
        onSubmit={savePost}
        onUpdateForm={updateForm}
        onUpdateTagInput={updateTagInput}
        onUploadCoverImage={(file) => void uploadCoverImageFile(file)}
        tagInput={tagInput}
        uploadingImage={uploadingImage}
      />
    </section>
  );
}
