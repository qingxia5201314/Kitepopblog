import { ClipboardEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { BlogPost, BlogPostDraft, PostStatus } from '../lib/blog';
import { formatTagInput, parseTagInput } from '../lib/tags';
import { createPost, updatePost } from '../lib/blogApi';
import { createDraftAutosaveRepository } from '../lib/draftAutosave';
import { normalizeImageUrl } from '../lib/imageUrl';
import { uploadHostedImage } from '../lib/imageApi';
import { createMarkdownImageBlock, getFirstClipboardImage, insertAtSelection } from '../lib/markdownInsert';
import { AppNotification, NotificationType } from '../lib/notification';

type EditorTab = 'edit' | 'preview';

type NotifyFn = (type: NotificationType, message: string, durationMs?: number) => void;

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

const draftRepository = createDraftAutosaveRepository();

export function useEditor(adminToken: string, notify: NotifyFn, loadPosts: () => Promise<void>) {
  const [form, setForm] = useState<BlogPostDraft>(() => draftRepository.load() ?? EMPTY_FORM);
  const [tagInput, setTagInput] = useState(() => {
    const draft = draftRepository.load() ?? EMPTY_FORM;
    return formatTagInput(draft.tags);
  });
  const [editorTab, setEditorTab] = useState<EditorTab>('edit');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [autosaveNote, setAutosaveNote] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [notification, setNotification] = useState<AppNotification | null>(null);

  const contentEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const coverImageInputRef = useRef<HTMLInputElement | null>(null);

  // Autosave draft effect
  useEffect(() => {
    if (!adminToken || editingId) return;

    const hasDraftContent =
      form.title.trim() || form.summary.trim() || form.content.trim() || form.tags.length > 0 || form.coverImage;

    if (hasDraftContent) {
      draftRepository.save(form);
      setAutosaveNote('草稿已自动保存到本地浏览器');
    }
  }, [adminToken, editingId, form]);

  const updateForm = (patch: Partial<BlogPostDraft>) => {
    setForm((current) => ({ ...current, ...patch }));
    setNotification((current) => (current?.type === 'error' ? null : current));
  };

  const updateTagInput = (value: string) => {
    setTagInput(value);
    updateForm({ tags: parseTagInput(value) });
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
      await loadPosts();
      notify('success', saved.status === 'published' ? '文章已保存并发布' : '文章已保存为草稿');
      draftRepository.clear();
      startEdit(saved, false);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文章保存失败');
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

  return {
    form,
    updateForm,
    tagInput,
    updateTagInput,
    editorTab,
    setEditorTab,
    editingId,
    startCreate,
    startEdit,
    savePost,
    autosaveNote,
    uploadingImage,
    insertMarkdownSnippet,
    insertImageFile,
    uploadCoverImageFile,
    pasteImageIntoEditor,
    contentEditorRef,
    imageInputRef,
    coverImageInputRef
  };
}
