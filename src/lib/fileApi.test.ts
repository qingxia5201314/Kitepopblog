import { describe, expect, it, vi } from 'vitest';
import {
  createFileFolder,
  createFileLink,
  deleteFileFolder,
  deleteUploadedFile,
  getFileFolderView,
  renameFileFolder,
  uploadFile
} from './fileApi';

describe('file api client', () => {
  it('uses admin bearer tokens for file operations', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ folder: null, breadcrumbs: [], folders: [], files: [] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ file: { id: 'file-1' } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ link: { path: '/api/files/raw/file-1?token=t' } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ folder: { id: 'folder-1', name: 'RFI' } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ folder: { id: 'folder-1', name: 'SRC' } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true })
      });
    vi.stubGlobal('fetch', fetchMock);

    await getFileFolderView('admin-token', 'folder-root');
    await uploadFile(new File(['payload'], 'rfi.txt', { type: 'text/plain' }), 'admin-token', 'folder-root');
    await createFileLink('file-1', 'admin-token');
    await deleteUploadedFile('file-1', 'admin-token');
    await createFileFolder({ name: 'RFI', parentId: 'folder-root' }, 'admin-token');
    await renameFileFolder('folder-1', 'SRC', 'admin-token');
    await deleteFileFolder('folder-1', 'admin-token');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/files?folderId=folder-root', {
      headers: { Authorization: 'Bearer admin-token' }
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/files', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' }
    }));
    expect((fetchMock.mock.calls[1][1].body as FormData).get('folderId')).toBe('folder-root');
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/files/file-1/link', {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' }
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/files/file-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer admin-token' }
    });
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/file-folders', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer admin-token' })
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(6, '/api/file-folders/folder-1', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ Authorization: 'Bearer admin-token' })
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(7, '/api/file-folders/folder-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer admin-token' }
    });
  });
});
