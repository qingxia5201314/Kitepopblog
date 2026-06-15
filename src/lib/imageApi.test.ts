import { describe, expect, it, vi } from 'vitest';
import { deleteHostedImage, listHostedImages, uploadHostedImage } from './imageApi';

describe('image api client', () => {
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
});
