export type ImageHostProvider = 'custom';

export interface ImageHostSettings {
  provider: ImageHostProvider;
  token: string;
  uploadUrl: string;
  fileFieldName: string;
  urlPath: string;
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

export const DEFAULT_IMAGE_HOST_SETTINGS: ImageHostSettings = {
  provider: 'custom',
  token: '',
  uploadUrl: 'https://sm.ms/api/v2/upload',
  fileFieldName: 'smfile',
  urlPath: 'data.url'
};

export function readValueByPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }

    return undefined;
  }, source);
}

export async function uploadToImageHost(file: File, settings: ImageHostSettings): Promise<UploadedImage> {
  if (!settings.uploadUrl.trim()) {
    throw new Error('请先配置图床上传接口');
  }

  const formData = new FormData();
  formData.append(settings.fileFieldName.trim() || 'file', file);

  const headers: HeadersInit = {};
  if (settings.token.trim()) {
    headers.Authorization = settings.token.trim();
  }

  const response = await fetch(settings.uploadUrl.trim(), {
    method: 'POST',
    headers,
    body: formData
  });

  const payload = await response.json();
  const configuredUrl = readValueByPath(payload, settings.urlPath.trim() || 'data.url');

  if (typeof configuredUrl === 'string' && configuredUrl) {
    return {
      url: configuredUrl,
      filename: configuredUrl.split('/').pop() ?? file.name
    };
  }

  return parseSmmsUploadResponse(payload);
}

export function uploadToSmms(file: File, token: string): Promise<UploadedImage> {
  return uploadToImageHost(file, {
    ...DEFAULT_IMAGE_HOST_SETTINGS,
    token
  });
}

export function createImageHostSettingsRepository(
  storageKey = 'kitepop-image-host-settings'
): ImageHostSettingsRepository {
  return {
    load() {
      const value = localStorage.getItem(storageKey);

      if (!value) {
        return DEFAULT_IMAGE_HOST_SETTINGS;
      }

      try {
        const parsed = JSON.parse(value) as Partial<ImageHostSettings>;
        return {
          ...DEFAULT_IMAGE_HOST_SETTINGS,
          ...parsed,
          provider: 'custom',
          token: parsed.token ?? ''
        };
      } catch {
        return DEFAULT_IMAGE_HOST_SETTINGS;
      }
    },

    save(settings) {
      localStorage.setItem(storageKey, JSON.stringify(settings));
    }
  };
}
