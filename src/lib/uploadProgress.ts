export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
  speedBytesPerSecond: number;
}

export type UploadProgressHandler = (progress: UploadProgress) => void;

interface UploadFormDataOptions {
  formData: FormData;
  headers?: Record<string, string>;
  method?: string;
  onProgress?: UploadProgressHandler;
  url: string;
}

function parseUploadResponse<T>(xhr: XMLHttpRequest): T {
  const text = String(xhr.responseText || '');
  const payload = text.trim() ? JSON.parse(text) as T & { message?: string } : {} as T & { message?: string };
  if (xhr.status < 200 || xhr.status >= 300) {
    throw new Error(payload.message || `上传失败（HTTP ${xhr.status}）`);
  }
  return payload as T;
}

export function uploadFormDataWithProgress<T>({
  formData,
  headers = {},
  method = 'POST',
  onProgress,
  url
}: UploadFormDataOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startedAt = Date.now();

    xhr.open(method, url);
    Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
      onProgress({
        loaded: event.loaded,
        total: event.total,
        percent: event.total > 0 ? Math.min(100, Math.round((event.loaded / event.total) * 100)) : 0,
        speedBytesPerSecond: event.loaded / elapsedSeconds
      });
    };

    xhr.onload = () => {
      try {
        resolve(parseUploadResponse<T>(xhr));
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => reject(new Error('上传失败，请检查网络连接'));
    xhr.onabort = () => reject(new Error('上传已取消'));
    xhr.send(formData);
  });
}
