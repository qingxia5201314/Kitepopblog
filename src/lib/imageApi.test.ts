import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteHostedImage, listHostedImages, uploadHostedImage } from './imageApi';
import { uploadFormDataWithProgress } from './uploadProgress';

vi.mock('./uploadProgress', () => ({
  uploadFormDataWithProgress: vi.fn()
}));

describe('image api client', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses admin bearer tokens for image operations', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ images: [] }))
      .mockResolvedValueOnce(Response.json({ image: { id: 'img-1', path: '/api/images/raw/img-1' } }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await listHostedImages('admin-token');
    await uploadHostedImage(new File(['png'], 'pasted.png', { type: 'image/png' }), 'admin-token');
    await deleteHostedImage('img-1', 'admin-token');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/images', {
      headers: { Authorization: 'Bearer admin-token' }
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/images', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' }
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/images/img-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer admin-token' }
    });
  });

  it('turns html error pages into readable upload errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      text: async () => '<html><body>Request too large</body></html>'
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      uploadHostedImage(new File(['png'], 'pasted.png', { type: 'image/png' }), 'admin-token')
    ).rejects.toThrow('图片上传失败：服务器返回了 HTML 页面（HTTP 413）');
  });

  it('uses the progress uploader for image uploads when progress is requested', async () => {
    vi.mocked(uploadFormDataWithProgress).mockResolvedValue({
      image: {
        id: 'img-1',
        originalName: 'pasted.png',
        contentType: 'image/png',
        sizeBytes: 3,
        uploadedAt: '2026-06-26T00:00:00.000Z',
        path: '/api/images/raw/img-1'
      }
    });
    const onProgress = vi.fn();

    const image = await uploadHostedImage(
      new File(['png'], 'pasted.png', { type: 'image/png' }),
      'admin-token',
      onProgress
    );

    expect(image.id).toBe('img-1');
    expect(uploadFormDataWithProgress).toHaveBeenCalledWith(expect.objectContaining({
      headers: { Authorization: 'Bearer admin-token' },
      onProgress,
      url: '/api/images'
    }));
    expect(vi.mocked(uploadFormDataWithProgress).mock.calls[0][0].formData.get('file')).toBeInstanceOf(File);
  });
});
