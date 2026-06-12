export type ImageHostProvider = 'smms';

export interface ImageHostSettings {
  provider: ImageHostProvider;
  token: string;
}

export interface UploadedImage {
  url: string;
  filename: string;
}

interface SmmsSuccessResponse {
  success: true;
  data: {
    url: string;
    filename?: string;
    storename?: string;
  };
}

interface SmmsDuplicateResponse {
  success: false;
  code: 'image_repeated';
  images: string;
  message?: string;
}

interface SmmsFailureResponse {
  success: false;
  message?: string;
}

type SmmsResponse = SmmsSuccessResponse | SmmsDuplicateResponse | SmmsFailureResponse;

export interface ImageHostSettingsRepository {
  load(): ImageHostSettings;
  save(settings: ImageHostSettings): void;
}

export function buildImageMarkdown(alt: string, url: string): string {
  const safeAlt = alt.trim() || 'image';
  return `![${safeAlt}](${url.trim()})`;
}

export function parseSmmsUploadResponse(response: unknown): UploadedImage {
  const data = response as SmmsResponse;

  if (data.success) {
    return {
      url: data.data.url,
      filename: data.data.filename ?? data.data.storename ?? 'image'
    };
  }

  if ('code' in data && data.code === 'image_repeated') {
    return {
      url: data.images,
      filename: data.images.split('/').pop() ?? 'image'
    };
  }

  throw new Error(data.message || '图床上传失败');
}

export async function uploadToSmms(file: File, token: string): Promise<UploadedImage> {
  if (!token.trim()) {
    throw new Error('请先配置 SM.MS Token');
  }

  const formData = new FormData();
  formData.append('smfile', file);

  const response = await fetch('https://sm.ms/api/v2/upload', {
    method: 'POST',
    headers: {
      Authorization: token.trim()
    },
    body: formData
  });

  const payload = await response.json();
  return parseSmmsUploadResponse(payload);
}

export function createImageHostSettingsRepository(
  storageKey = 'kitepop-image-host-settings'
): ImageHostSettingsRepository {
  return {
    load() {
      const value = localStorage.getItem(storageKey);

      if (!value) {
        return { provider: 'smms', token: '' };
      }

      try {
        const parsed = JSON.parse(value) as Partial<ImageHostSettings>;
        return {
          provider: parsed.provider === 'smms' ? parsed.provider : 'smms',
          token: parsed.token ?? ''
        };
      } catch {
        return { provider: 'smms', token: '' };
      }
    },

    save(settings) {
      localStorage.setItem(storageKey, JSON.stringify(settings));
    }
  };
}
