import { describe, expect, it, vi } from 'vitest';
import { deleteHostedImage, listHostedImages, uploadHostedImage } from './imageApi';

describe('image api client', () => {
  it('uses admin bearer tokens for image operations', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: [] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ image: { id: 'img-1', path: '/api/images/raw/img-1' } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true })
      });
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
});
