import React, { useState, useRef, FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { useImages } from '../hooks/useImages';
import { HostedImage, deleteHostedImage, uploadHostedImage } from '../lib/imageApi';
import { formatBytes } from '../components/shared';
import { copyTextToClipboard } from '../lib/clipboard';

export function ImagesPage() {
  const { notify, adminToken } = useApp();
  const {
    hostedImages,
    uploadingImage,
    copiedImageLink,
    setCopiedImageLink,
    loadHostedImages
  } = useImages(adminToken, notify);

  const [imagePassword, setImagePassword] = useState('');
  const [imageDragActive, setImageDragActive] = useState(false);
  const [localAdminToken, setLocalAdminToken] = useState(adminToken);
  const imageHostInputRef = useRef<HTMLInputElement | null>(null);

  const handleUnlockImages = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: imagePassword })
      });
      const result = (await response.json()) as { ok?: boolean; message?: string; token?: string; expiresAt?: string };

      if (!response.ok || !result.ok || !result.token) {
        notify('error', result.message || '后台口令不正确');
        return;
      }

      setLocalAdminToken(result.token);
      window.localStorage.setItem('kitepop-admin-session', JSON.stringify({ token: result.token, expiresAt: result.expiresAt }));
      setImagePassword('');
      await loadHostedImages(result.token);
      notify('success', '已进入图床');
    } catch {
      notify('error', '无法连接图床登录接口');
    }
  };

  const handleHostedImageUpload = async (file?: File) => {
    if (!file || !localAdminToken) return;
    if (!file.type.startsWith('image/')) {
      notify('error', '图床只允许上传图片文件');
      return;
    }

    try {
      const image = await uploadHostedImage(file, localAdminToken);
      const link = new URL(image.path, window.location.origin).toString();
      setCopiedImageLink(link);
      await loadHostedImages(localAdminToken);
      const copied = await copyTextToClipboard(link);
      notify('success', copied ? '图片已上传，链接已复制' : '图片已上传，请手动复制链接');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '图片上传失败');
    } finally {
      if (imageHostInputRef.current) imageHostInputRef.current.value = '';
    }
  };

  const handleCopyHostedImageLink = async (image: HostedImage) => {
    const link = new URL(image.path, window.location.origin).toString();
    setCopiedImageLink(link);
    const copied = await copyTextToClipboard(link);
    notify(copied ? 'success' : 'info', copied ? '图片链接已复制' : '请手动复制图片链接');
  };

  const handleRemoveHostedImage = async (image: HostedImage) => {
    if (!localAdminToken || !window.confirm(`确认删除 ${image.originalName} 吗？`)) return;
    try {
      await deleteHostedImage(image.id, localAdminToken);
      await loadHostedImages(localAdminToken);
      if (copiedImageLink.includes(image.id)) setCopiedImageLink('');
      notify('success', '图片已删除');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '图片删除失败');
    }
  };

  if (!localAdminToken) {
    return (
      <section className="image-host-page">
        <form className="unlock-panel" onSubmit={handleUnlockImages}>
          <p className="eyebrow">Private Image Host</p>
          <h1>图床</h1>
          <p>
            输入后台口令后上传图片。这里只允许 PNG、JPG、GIF、WebP 图片，上传成功后会自动复制公开访问链接。
          </p>
          <input
            aria-label="图床口令"
            onChange={(event) => setImagePassword(event.target.value)}
            placeholder="输入后台口令"
            type="password"
            value={imagePassword}
          />
          <button type="submit">进入图床</button>
        </form>
      </section>
    );
  }

  return (
    <section className="image-host-page">
      <section className="image-host-layout">
        <div className="file-hero accounting-card">
          <div>
            <p className="eyebrow">Image Host</p>
            <h1>图床</h1>
            <p>上传成功后自动复制图片链接，可直接粘贴到 Markdown、报告或网页中使用。</p>
          </div>
          <button onClick={() => loadHostedImages(localAdminToken)} type="button">
            刷新列表
          </button>
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
            handleHostedImageUpload(event.dataTransfer.files[0]);
          }}
        >
          <input
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={(event) => handleHostedImageUpload(event.target.files?.[0])}
            ref={imageHostInputRef}
            type="file"
          />
          <strong>拖拽图片到这里，或选择上传</strong>
          <span>仅允许 PNG、JPG、GIF、WebP，上传需要后台鉴权。</span>
          <button
            disabled={uploadingImage}
            onClick={() => imageHostInputRef.current?.click()}
            type="button"
          >
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
                  <img alt={image.originalName} src={image.path} />
                  <div>
                    <strong>{image.originalName}</strong>
                    <small>
                      {formatBytes(image.sizeBytes)} · {image.contentType}
                    </small>
                    <code>{link}</code>
                  </div>
                  <button onClick={() => handleCopyHostedImageLink(image)} type="button">
                    复制链接
                  </button>
                  <button className="danger" onClick={() => handleRemoveHostedImage(image)} type="button">
                    删除
                  </button>
                </div>
              );
            })}
            {hostedImages.length === 0 ? (
              <div className="empty-state">还没有上传图片。</div>
            ) : null}
          </div>
        </section>
      </section>
    </section>
  );
}
