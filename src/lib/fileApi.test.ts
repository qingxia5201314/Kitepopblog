import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFileFolder,
  createFileLink,
  deleteFileFolder,
  deleteUploadedFile,
  getFileFolderView,
  getFilePreviewLink,
  listUploadedFiles,
  renameFileFolder,
  uploadFile
} from './fileApi';
import { uploadFormDataWithProgress } from './uploadProgress';

vi.mock('./uploadProgress', () => ({
  uploadFormDataWithProgress: vi.fn()
}));

const uploadedFile = {
  id: 'file-1',
  originalName: 'rfi.txt',
  contentType: 'text/plain',
  sizeBytes: 7,
  uploadedAt: '2026-06-26T00:00:00.000Z',
  folderId: 'folder-root'
};

describe('file api client', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses same-origin cookies for file operations', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({
      folder: { id: 'folder-1', name: 'RFI' },
      breadcrumbs: [],
      folders: [],
      files: [],
      file: uploadedFile,
      link: { path: '/api/files/raw/file-1?token=temporary-link', token: 'temporary-link' },
      ok: true
    })));
    vi.stubGlobal('fetch', fetchMock);
    const inputFile = new File(['payload'], 'rfi.txt', { type: 'text/plain' });

    await getFileFolderView('folder-root');
    await listUploadedFiles();
    await uploadFile(inputFile, 'folder-root');
    await createFileLink('file-1');
    await getFilePreviewLink('file-1');
    await deleteUploadedFile('file-1');
    await createFileFolder({ name: 'RFI', parentId: 'folder-root' });
    await renameFileFolder('folder-1', 'SRC');
    await deleteFileFolder('folder-1');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/files?folderId=folder-root', { credentials: 'same-origin' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/files', { credentials: 'same-origin' });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/files', {
      method: 'POST',
      credentials: 'same-origin',
      body: expect.any(FormData)
    });
    expect((fetchMock.mock.calls[2][1].body as FormData).get('folderId')).toBe('folder-root');
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/files/file-1/link', {
      method: 'POST',
      credentials: 'same-origin'
    });
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/files/file-1/preview-link', {
      method: 'POST',
      credentials: 'same-origin'
    });
    expect(fetchMock).toHaveBeenNthCalledWith(6, '/api/files/file-1', {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    expect(fetchMock).toHaveBeenNthCalledWith(7, '/api/file-folders', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'RFI', parentId: 'folder-root' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(8, '/api/file-folders/folder-1', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'SRC' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(9, '/api/file-folders/folder-1', {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Authorization');
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Bearer');
  });

  it('uses the cookie-authenticated progress uploader without auth headers', async () => {
    vi.mocked(uploadFormDataWithProgress).mockResolvedValue({ file: uploadedFile });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ file: uploadedFile })));
    const onProgress = vi.fn();

    const file = await uploadFile(
      new File(['payload'], 'rfi.txt', { type: 'text/plain' }),
      'folder-root',
      onProgress
    );

    expect(file.id).toBe('file-1');
    expect(uploadFormDataWithProgress).toHaveBeenCalledWith(expect.objectContaining({
      onProgress,
      url: '/api/files'
    }));
    expect(vi.mocked(uploadFormDataWithProgress).mock.calls[0][0]).not.toHaveProperty('headers');
    const formData = vi.mocked(uploadFormDataWithProgress).mock.calls[0][0].formData;
    expect(formData.get('folderId')).toBe('folder-root');
    expect(JSON.stringify(vi.mocked(uploadFormDataWithProgress).mock.calls)).not.toContain('Authorization');
    expect(JSON.stringify(vi.mocked(uploadFormDataWithProgress).mock.calls)).not.toContain('Bearer');
  });
});
