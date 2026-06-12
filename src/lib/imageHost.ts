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

const LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const URL_UNSAFE_WHITESPACE = /[\s\u0000-\u001f\u007f]/;

function normalizeHttpsUrl(value: string, allowLocalHttp: boolean): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || URL_UNSAFE_WHITESPACE.test(trimmed)) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }

  if (parsed.username || parsed.password) return undefined;
  if (parsed.protocol === 'https:') return parsed.toString();
  if (allowLocalHttp && parsed.protocol === 'http:' && LOCAL_HTTP_HOSTS.has(parsed.hostname)) {
    return parsed.toString();
  }

  return undefined;
}

export function normalizeImageUrl(value: string): string | undefined {
  return normalizeHttpsUrl(value, true);
}

export function normalizeUploadUrl(value: string): string | undefined {
  return normalizeHttpsUrl(value, true);
}

function sanitizeImageAlt(alt: string): string {
  return alt.trim().replace(/[\r\n]+/g, ' ') || 'image';
}

export function buildImageMarkdown(alt: string, url: string): string {
  const safeUrl = normalizeImageUrl(url);
  if (!safeUrl) {
    throw new Error('请输入 HTTPS 图片 URL（本地调试允许 localhost HTTP）');
  }

  return `![${sanitizeImageAlt(alt)}](${safeUrl})`;
}

export function parseSmmsUploadResponse(response: unknown): UploadedImage {
  const data = response as SmmsResponse;

  if (data.success) {
    const url = normalizeImageUrl(data.data.url);
    if (!url) throw new Error('图床返回了不安全的图片 URL');

    return {
      url,
      filename: data.data.filename ?? data.data.storename ?? 'image'
    };
  }

  if ('code' in data && data.code === 'image_repeated') {
    const url = normalizeImageUrl(data.images);
    if (!url) throw new Error('图床返回了不安全的图片 URL');

    return {
      url,
      filename: url.split('/').pop() ?? 'image'
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
  const uploadUrl = normalizeUploadUrl(settings.uploadUrl);

  if (!settings.uploadUrl.trim()) {
    throw new Error('请先配置图床上传接口');
  }

  if (!uploadUrl) {
    throw new Error('请输入 HTTPS 图床上传接口（本地调试允许 localhost HTTP）');
  }

  const formData = new FormData();
  formData.append(settings.fileFieldName.trim() || 'file', file);

  const headers: HeadersInit = {};
  if (settings.token.trim()) {
    headers.Authorization = settings.token.trim();
  }

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers,
    body: formData
  });

  const payload = await response.json();
  const configuredUrl = readValueByPath(payload, settings.urlPath.trim() || 'data.url');

  if (typeof configuredUrl === 'string' && configuredUrl) {
    const url = normalizeImageUrl(configuredUrl);
    if (!url) throw new Error('图床返回了不安全的图片 URL');

    return {
      url,
      filename: url.split('/').pop() ?? file.name
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
