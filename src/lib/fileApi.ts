import { UploadProgressHandler, uploadFormDataWithProgress } from './uploadProgress';

export interface UploadedFile {
  id: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  folderId: string;
}

export interface FileLink {
  path: string;
  token: string;
}

export interface FileFolder {
  id: string;
  name: string;
  parentId: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileFolderView {
  folder: FileFolder | null;
  breadcrumbs: FileFolder[];
  folders: FileFolder[];
  files: UploadedFile[];
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || '请求失败');
  }
  return payload as T;
}

export async function listUploadedFiles(token: string): Promise<UploadedFile[]> {
  return (await getFileFolderView(token)).files;
}

export async function getFileFolderView(token: string, folderId = ''): Promise<FileFolderView> {
  const search = new URLSearchParams();
  if (folderId) search.set('folderId', folderId);
  const payload = await parseResponse<FileFolderView>(
    await fetch(`/api/files${search.toString() ? `?${search}` : ''}`, {
      headers: authHeaders(token)
    })
  );
  return payload;
}

export async function uploadFile(
  file: File,
  token: string,
  folderId = '',
  onProgress?: UploadProgressHandler
): Promise<UploadedFile> {
  const formData = new FormData();
  formData.set('file', file);
  if (folderId) formData.set('folderId', folderId);
  if (onProgress) {
    const payload = await uploadFormDataWithProgress<{ file: UploadedFile }>({
      formData,
      headers: authHeaders(token) as Record<string, string>,
      onProgress,
      url: '/api/files'
    });
    return payload.file;
  }
  const payload = await parseResponse<{ file: UploadedFile }>(
    await fetch('/api/files', {
      method: 'POST',
      headers: authHeaders(token),
      body: formData
    })
  );
  return payload.file;
}

export async function createFileFolder(input: { name: string; parentId?: string }, token: string): Promise<FileFolder> {
  const payload = await parseResponse<{ folder: FileFolder }>(
    await fetch('/api/file-folders', {
      method: 'POST',
      headers: {
        ...authHeaders(token),
        'content-type': 'application/json'
      },
      body: JSON.stringify(input)
    })
  );
  return payload.folder;
}

export async function renameFileFolder(id: string, name: string, token: string): Promise<FileFolder> {
  const payload = await parseResponse<{ folder: FileFolder }>(
    await fetch(`/api/file-folders/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: {
        ...authHeaders(token),
        'content-type': 'application/json'
      },
      body: JSON.stringify({ name })
    })
  );
  return payload.folder;
}

export async function deleteFileFolder(id: string, token: string): Promise<void> {
  await parseResponse<{ ok: boolean }>(
    await fetch(`/api/file-folders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(token)
    })
  );
}

export async function createFileLink(id: string, token: string): Promise<FileLink> {
  const payload = await parseResponse<{ link: FileLink }>(
    await fetch(`/api/files/${encodeURIComponent(id)}/link`, {
      method: 'POST',
      headers: authHeaders(token)
    })
  );
  return payload.link;
}

export async function getFilePreviewLink(id: string, token: string): Promise<FileLink> {
  const payload = await parseResponse<{ link: FileLink }>(
    await fetch(`/api/files/${encodeURIComponent(id)}/preview-link`, {
      method: 'POST',
      headers: authHeaders(token)
    })
  );
  return payload.link;
}

export async function deleteUploadedFile(id: string, token: string): Promise<void> {
  await parseResponse<{ ok: boolean }>(
    await fetch(`/api/files/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(token)
    })
  );
}
