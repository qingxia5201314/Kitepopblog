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
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  const trimmed = text.trim();
  const looksJson = contentType.includes('application/json') || trimmed.startsWith('{') || trimmed.startsWith('[');

  if (looksJson) {
    try {
      const payload = (trimmed ? JSON.parse(trimmed) : {}) as T & { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || '请求失败');
      }
      return payload as T;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`图片上传失败：服务器返回了非 JSON 响应（HTTP ${response.status}）`);
      }
      throw error;
    }
  }

  if (!response.ok) {
    const responseKind = contentType.includes('text/html') || trimmed.startsWith('<') ? 'HTML 页面' : '非 JSON 响应';
    throw new Error(`图片上传失败：服务器返回了 ${responseKind}（HTTP ${response.status}）`);
  }

  throw new Error('图片上传失败：服务器返回了非 JSON 响应');
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
