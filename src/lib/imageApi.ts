export interface HostedImage {
  id: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  path: string;
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

export async function listHostedImages(token: string): Promise<HostedImage[]> {
  const payload = await parseResponse<{ images: HostedImage[] }>(
    await fetch('/api/images', {
      headers: authHeaders(token)
    })
  );
  return payload.images;
}

export async function uploadHostedImage(file: File, token: string): Promise<HostedImage> {
  const formData = new FormData();
  formData.set('file', file);
  const payload = await parseResponse<{ image: HostedImage }>(
    await fetch('/api/images', {
      method: 'POST',
      headers: authHeaders(token),
      body: formData
    })
  );
  return payload.image;
}

export async function deleteHostedImage(id: string, token: string): Promise<void> {
  await parseResponse<{ ok: boolean }>(
    await fetch(`/api/images/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(token)
    })
  );
}
