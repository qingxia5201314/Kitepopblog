import React, { useState, useRef, FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { useFiles } from '../hooks/useFiles';
import {
  FileFolder,
  UploadedFile,
  createFileFolder,
  createFileLink,
  deleteFileFolder,
  deleteUploadedFile,
  renameFileFolder,
  uploadFile
} from '../lib/fileApi';
import { formatBytes } from '../components/shared';

export function FilesPage() {
  const { notify, adminToken } = useApp();
  const {
    activeFileFolderId,
    fileFolderView,
    uploadingFile,
    generatedFileLink,
    setGeneratedFileLink,
    loadFiles,
    openFolder,
    handleFileUpload,
    copyFileLink,
    remove,
    createFolder,
    renameFolder,
    removeFolder
  } = useFiles(adminToken, notify);

  const [filePassword, setFilePassword] = useState('');
  const [fileDragActive, setFileDragActive] = useState(false);
  const [localAdminToken, setLocalAdminToken] = useState(adminToken);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUnlockFiles = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: filePassword })
      });
      const result = (await response.json()) as { ok?: boolean; message?: string; token?: string; expiresAt?: string };

      if (!response.ok || !result.ok || !result.token) {
        notify('error', result.message || '后台口令不正确');
        return;
      }

      setLocalAdminToken(result.token);
      window.localStorage.setItem('kitepop-admin-session', JSON.stringify({ token: result.token, expiresAt: result.expiresAt }));
      setFilePassword('');
      await loadFiles(result.token, activeFileFolderId);
      notify('success', '已进入文件仓库');
    } catch {
      notify('error', '无法连接文件登录接口');
    }
  };

  const handleFileUploadWrapper = async (file?: File) => {
    if (!file || !localAdminToken) return;
    try {
      await uploadFile(file, localAdminToken, activeFileFolderId);
      await loadFiles(localAdminToken, activeFileFolderId);
      notify('success', '文件已上传');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文件上传失败');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCopyFileLink = async (file: UploadedFile) => {
    if (!localAdminToken) return;
    try {
      const link = await createFileLink(file.id, localAdminToken);
      const absoluteLink = new URL(link.path, window.location.origin).toString();
      setGeneratedFileLink(absoluteLink);
      await navigator.clipboard.writeText(absoluteLink);
      notify('success', '签名链接已复制');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '生成链接失败');
    }
  };

  const handleRemoveFile = async (file: UploadedFile) => {
    if (!localAdminToken) return;
    const confirmed = window.confirm(`确认删除 ${file.originalName} 吗？删除后签名链接会立即失效。`);
    if (!confirmed) return;

    try {
      await deleteUploadedFile(file.id, localAdminToken);
      await loadFiles(localAdminToken, activeFileFolderId);
      setGeneratedFileLink('');
      notify('success', '文件已删除');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文件删除失败');
    }
  };

  const handleOpenFolder = (folderId = '') => {
    setGeneratedFileLink('');
    openFolder(folderId);
  };

  const handleCreateFolder = async () => {
    if (!localAdminToken) return;
    const name = window.prompt('文件夹名称');
    if (!name?.trim()) return;

    try {
      await createFileFolder({ name: name.trim(), parentId: activeFileFolderId }, localAdminToken);
      await loadFiles(localAdminToken, activeFileFolderId);
      notify('success', '文件夹已创建');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文件夹创建失败');
    }
  };

  const handleRenameFolder = async (folder: FileFolder) => {
    if (!localAdminToken) return;
    const name = window.prompt('新的文件夹名称', folder.name);
    if (!name?.trim() || name.trim() === folder.name) return;

    try {
      await renameFileFolder(folder.id, name.trim(), localAdminToken);
      await loadFiles(localAdminToken, activeFileFolderId);
      notify('success', '文件夹已重命名');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文件夹重命名失败');
    }
  };

  const handleRemoveFolder = async (folder: FileFolder) => {
    if (!localAdminToken) return;
    const confirmed = window.confirm(`确认删除空文件夹 ${folder.name} 吗？非空文件夹不会被删除。`);
    if (!confirmed) return;

    try {
      await deleteFileFolder(folder.id, localAdminToken);
      await loadFiles(localAdminToken, activeFileFolderId);
      notify('success', '文件夹已删除');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文件夹删除失败');
    }
  };

  if (!localAdminToken) {
    return (
      <section className="files-page">
        <form className="unlock-panel" onSubmit={handleUnlockFiles}>
          <p className="eyebrow">Private Files</p>
          <h1>文件仓库</h1>
          <p>
            输入后台口令后上传文件、生成签名访问链接。文件不限类型，但上传、管理和链接生成都需要后台鉴权。
          </p>
          <input
            aria-label="文件仓库口令"
            onChange={(event) => setFilePassword(event.target.value)}
            placeholder="输入后台口令"
            type="password"
            value={filePassword}
          />
          <button type="submit">进入文件仓库</button>
        </form>
      </section>
    );
  }

  return (
    <section className="files-page">
      <section className="files-layout">
        <div className="file-hero accounting-card">
          <div>
            <p className="eyebrow">Signed Storage</p>
            <h1>文件仓库</h1>
            <p>
              上传后的文件默认不可公开访问，只有生成签名链接后才可被外部读取。删除文件会让旧链接立即失效。
            </p>
          </div>
          <button onClick={() => loadFiles(localAdminToken, activeFileFolderId)} type="button">
            刷新列表
          </button>
        </div>

        <section className="file-toolbar accounting-card">
          <div className="file-breadcrumbs" aria-label="文件夹路径">
            <button className={!activeFileFolderId ? 'active' : ''} onClick={() => handleOpenFolder('')} type="button">
              根目录
            </button>
            {fileFolderView.breadcrumbs.map((folder) => (
              <button
                className={folder.id === activeFileFolderId ? 'active' : ''}
                key={folder.id}
                onClick={() => handleOpenFolder(folder.id)}
                type="button"
              >
                {folder.name}
              </button>
            ))}
          </div>
          <button onClick={() => handleCreateFolder()} type="button">
            新建文件夹
          </button>
        </section>

        {fileFolderView.folders.length ? (
          <section className="folder-grid" aria-label="文件夹">
            {fileFolderView.folders.map((folder) => (
              <div className="folder-item" key={folder.id}>
                <button className="folder-open" onClick={() => handleOpenFolder(folder.id)} type="button">
                  <span className="folder-icon">DIR</span>
                  <span>
                    <strong>{folder.name}</strong>
                    <small>{new Date(folder.updatedAt).toLocaleString('zh-CN')}</small>
                  </span>
                </button>
                <div>
                  <button onClick={() => handleRenameFolder(folder)} type="button">
                    重命名
                  </button>
                  <button className="danger" onClick={() => handleRemoveFolder(folder)} type="button">
                    删除
                  </button>
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
            handleFileUploadWrapper(event.dataTransfer.files[0]);
          }}
        >
          <input
            onChange={(event) => handleFileUploadWrapper(event.target.files?.[0])}
            ref={fileInputRef}
            type="file"
          />
          <strong>拖拽文件到这里，或选择上传</strong>
          <span>不限文件类型，单文件大小受服务端 FILE_UPLOAD_LIMIT 控制。</span>
          <button
            disabled={uploadingFile}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
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
                  <small>
                    {formatBytes(file.sizeBytes)} · {file.contentType} · {new Date(file.uploadedAt).toLocaleString('zh-CN')}
                  </small>
                </span>
                <button onClick={() => handleCopyFileLink(file)} type="button">
                  复制链接
                </button>
                <button className="danger" onClick={() => handleRemoveFile(file)} type="button">
                  删除
                </button>
              </div>
            ))}
            {fileFolderView.files.length === 0 ? (
              <div className="empty-state">这个目录还没有文件。</div>
            ) : null}
          </div>
        </section>
      </section>
    </section>
  );
}
