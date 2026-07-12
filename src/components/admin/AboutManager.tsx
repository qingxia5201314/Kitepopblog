import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { AboutProfile, emptyAboutProfile } from '../../lib/about';
import { getAdminAboutProfile, updateAboutProfile } from '../../lib/aboutApi';
import { uploadHostedImage } from '../../lib/imageApi';
import { MarkdownContent } from '../MarkdownContent';

type Notify = (type: 'success' | 'error' | 'info', message: string) => void;

interface AboutManagerProps {
  adminPanelOpen: boolean;
  adminToken: string;
  notify: Notify;
  onTogglePanel: () => void;
}

const GITHUB_ERROR = 'GitHub 链接必须是 https://github.com/{用户名}';

function formatTags(tags: string[]) {
  return tags.join(', ');
}

function parseTags(value: string) {
  const seen = new Set<string>();
  return value
    .split(/[,，\n]/)
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isValidGithubUrl(value: string) {
  const githubUrl = value.trim();
  if (!githubUrl) return true;
  try {
    const url = new URL(githubUrl);
    const authority = githubUrl.match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i)?.[1];
    const pathname = url.pathname.replace(/\/+$/, '');
    const username = pathname.match(/^\/([a-z\d]+(?:-[a-z\d]+)*)$/i)?.[1];
    return url.protocol === 'https:' && url.hostname === 'github.com' && authority?.toLowerCase() === 'github.com'
      && !url.username && !url.password && Boolean(username) && username!.length <= 39;
  } catch {
    return false;
  }
}

export function AboutManager({ adminPanelOpen, adminToken, notify, onTogglePanel }: AboutManagerProps) {
  const [form, setForm] = useState<AboutProfile>(() => emptyAboutProfile());
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [markdownTab, setMarkdownTab] = useState<'edit' | 'preview'>('edit');
  const mountedRef = useRef(true);
  const loadedTokenRef = useRef('');
  const generationRef = useRef(0);
  const asyncContextRef = useRef({ adminPanelOpen, adminToken });
  const statusTokenRef = useRef(adminToken);
  const loadRequestRef = useRef(0);
  const uploadRequestRef = useRef(0);
  const saveRequestRef = useRef(0);
  const openRef = useRef(adminPanelOpen);

  if (asyncContextRef.current.adminPanelOpen !== adminPanelOpen || asyncContextRef.current.adminToken !== adminToken) {
    generationRef.current += 1;
    asyncContextRef.current = { adminPanelOpen, adminToken };
  }
  openRef.current = adminPanelOpen;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadRequestRef.current += 1;
      uploadRequestRef.current += 1;
      saveRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const tokenChanged = statusTokenRef.current !== adminToken;
    statusTokenRef.current = adminToken;
    if (tokenChanged) {
      setUploading(false);
      setSaving(false);
    }
    if (!adminPanelOpen || !adminToken || loadedTokenRef.current === adminToken) {
      if (!adminPanelOpen || !adminToken) {
        loadRequestRef.current += 1;
        uploadRequestRef.current += 1;
        saveRequestRef.current += 1;
        setLoading(false);
        setUploading(false);
        setSaving(false);
      }
      return;
    }

    const requestId = ++loadRequestRef.current;
    const generation = generationRef.current;
    setLoading(true);
    void getAdminAboutProfile(adminToken)
      .then((profile) => {
        if (!mountedRef.current || !openRef.current || generation !== generationRef.current || requestId !== loadRequestRef.current) return;
        setForm(profile);
        setTagInput(formatTags(profile.identityTags));
        loadedTokenRef.current = adminToken;
      })
      .catch((error) => {
        if (!mountedRef.current || !openRef.current || generation !== generationRef.current || requestId !== loadRequestRef.current) return;
        notify('error', error instanceof Error ? error.message : '个人资料加载失败');
      })
      .finally(() => {
        if (mountedRef.current && openRef.current && generation === generationRef.current && requestId === loadRequestRef.current) setLoading(false);
      });
  }, [adminPanelOpen, adminToken, notify]);

  const updateForm = (patch: Partial<AboutProfile>) => setForm((current) => ({ ...current, ...patch }));

  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('error', '请选择图片文件');
      return;
    }

    const requestId = ++uploadRequestRef.current;
    const generation = generationRef.current;
    setUploading(true);
    try {
      const image = await uploadHostedImage(file, adminToken);
      if (!mountedRef.current || !openRef.current || generation !== generationRef.current || requestId !== uploadRequestRef.current) return;
      updateForm({ avatarUrl: image.path });
      notify('success', '头像上传成功，请保存资料以正式生效');
    } catch (error) {
      if (!mountedRef.current || !openRef.current || generation !== generationRef.current || requestId !== uploadRequestRef.current) return;
      notify('error', error instanceof Error ? error.message : '头像上传失败');
    } finally {
      if (mountedRef.current && openRef.current && generation === generationRef.current && requestId === uploadRequestRef.current) setUploading(false);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const displayName = form.displayName.trim();
    if (!displayName) return notify('error', '请填写名称');
    if (displayName.length > 80) return notify('error', '名称不能超过 80 个字符');
    if (!isValidGithubUrl(form.githubUrl)) return notify('error', GITHUB_ERROR);

    const payload: AboutProfile = {
      ...form,
      displayName,
      identityTags: parseTags(tagInput),
      githubUrl: form.githubUrl.trim()
    };
    const requestId = ++saveRequestRef.current;
    const generation = generationRef.current;
    setSaving(true);
    try {
      const saved = await updateAboutProfile(payload, adminToken);
      if (!mountedRef.current || !openRef.current || generation !== generationRef.current || requestId !== saveRequestRef.current) return;
      setForm(saved);
      setTagInput(formatTags(saved.identityTags));
      notify('success', '关于我资料已保存');
    } catch (error) {
      if (!mountedRef.current || !openRef.current || generation !== generationRef.current || requestId !== saveRequestRef.current) return;
      notify('error', error instanceof Error ? error.message : '个人资料保存失败');
    } finally {
      if (mountedRef.current && openRef.current && generation === generationRef.current && requestId === saveRequestRef.current) setSaving(false);
    }
  };

  return (
    <section className={adminPanelOpen ? 'admin-group admin-about-group open' : 'admin-group admin-about-group'}>
      <div className="panel-heading">
        <h2>关于我</h2>
        <button aria-controls="admin-about-panel" aria-expanded={adminPanelOpen} onClick={onTogglePanel} type="button">
          {adminPanelOpen ? '收起' : '展开'}
        </button>
      </div>
      {adminPanelOpen ? (
        <form className="admin-about-form" id="admin-about-panel" onSubmit={save}>
          {loading ? <p role="status">正在加载个人资料…</p> : null}
          <div className="admin-about-avatar-field">
            {form.avatarUrl ? <img alt="头像预览" className="admin-about-avatar-preview" src={form.avatarUrl} /> : null}
            <label>
              上传头像
              <input accept="image/*" aria-label="上传头像" disabled={loading || uploading || saving} onChange={uploadAvatar} type="file" />
            </label>
            {uploading ? <span role="status">正在上传头像…</span> : null}
          </div>
          <label>名称<input aria-label="名称" disabled={loading} onChange={(event) => updateForm({ displayName: event.target.value })} value={form.displayName} /></label>
          <label>身份标签<textarea aria-label="身份标签" disabled={loading} onChange={(event) => setTagInput(event.target.value)} placeholder="用逗号或换行分隔" rows={2} value={tagInput} /></label>
          <label>简短介绍<textarea aria-label="简短介绍" disabled={loading} onChange={(event) => updateForm({ intro: event.target.value })} value={form.intro} /></label>
          <label>GitHub 个人链接<input aria-label="GitHub 个人链接" disabled={loading} onChange={(event) => updateForm({ githubUrl: event.target.value })} placeholder="https://github.com/username" value={form.githubUrl} /></label>
          <div aria-label="Markdown 详细介绍模式" className="segmented-control admin-about-markdown-tabs" role="tablist">
            <button
              aria-controls="admin-about-markdown-edit-panel"
              aria-selected={markdownTab === 'edit'}
              className={markdownTab === 'edit' ? 'active' : ''}
              disabled={loading}
              id="admin-about-markdown-edit-tab"
              onClick={() => setMarkdownTab('edit')}
              role="tab"
              type="button"
            >编辑</button>
            <button
              aria-controls="admin-about-markdown-preview-panel"
              aria-selected={markdownTab === 'preview'}
              className={markdownTab === 'preview' ? 'active' : ''}
              disabled={loading}
              id="admin-about-markdown-preview-tab"
              onClick={() => setMarkdownTab('preview')}
              role="tab"
              type="button"
            >预览</button>
          </div>
          {markdownTab === 'edit' ? (
            <div aria-labelledby="admin-about-markdown-edit-tab" id="admin-about-markdown-edit-panel" role="tabpanel">
              <label>Markdown 详细介绍<textarea aria-label="Markdown 详细介绍" disabled={loading} onChange={(event) => updateForm({ content: event.target.value })} value={form.content} /></label>
            </div>
          ) : (
            <div
              aria-labelledby="admin-about-markdown-preview-tab"
              className="admin-about-markdown-preview"
              id="admin-about-markdown-preview-panel"
              role="tabpanel"
            ><MarkdownContent content={form.content} /></div>
          )}
          <button disabled={saving || uploading || loading} type="submit">{saving ? '保存中…' : '保存资料'}</button>
        </form>
      ) : null}
    </section>
  );
}
