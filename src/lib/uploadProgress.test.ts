import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadFormDataWithProgress } from './uploadProgress';

class FakeUploadTarget {
  onprogress: ((event: ProgressEvent) => void) | null = null;
}

class FakeXMLHttpRequest {
  static latest: FakeXMLHttpRequest | null = null;

  method = '';
  requestHeaders: Record<string, string> = {};
  responseText = '';
  status = 0;
  upload = new FakeUploadTarget();
  url = '';
  onabort: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  sentBody: FormData | null = null;

  constructor() {
    FakeXMLHttpRequest.latest = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.requestHeaders[name] = value;
  }

  send(body: FormData) {
    this.sentBody = body;
  }
}

describe('upload progress helper', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    FakeXMLHttpRequest.latest = null;
  });

  it('uploads form data through XHR and reports percent with speed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-26T00:00:00.000Z'));
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const onProgress = vi.fn();
    const formData = new FormData();
    formData.set('file', new File(['payload'], 'note.txt', { type: 'text/plain' }));

    const resultPromise = uploadFormDataWithProgress<{ file: { id: string } }>({
      formData,
      headers: { Authorization: 'Bearer admin-token' },
      onProgress,
      url: '/api/files'
    });
    const xhr = FakeXMLHttpRequest.latest!;

    vi.setSystemTime(new Date('2026-06-26T00:00:02.000Z'));
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 512, total: 1024 } as ProgressEvent);
    xhr.status = 200;
    xhr.responseText = JSON.stringify({ file: { id: 'file-1' } });
    xhr.onload?.();

    await expect(resultPromise).resolves.toEqual({ file: { id: 'file-1' } });
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/files');
    expect(xhr.requestHeaders.Authorization).toBe('Bearer admin-token');
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      loaded: 512,
      total: 1024,
      percent: 50,
      speedBytesPerSecond: 256
    }));
  });

  it('uses server messages for failed uploads', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const formData = new FormData();
    formData.set('file', new File(['payload'], 'note.txt', { type: 'text/plain' }));

    const resultPromise = uploadFormDataWithProgress<{ file: { id: string } }>({
      formData,
      url: '/api/files'
    });
    const xhr = FakeXMLHttpRequest.latest!;

    xhr.status = 413;
    xhr.responseText = JSON.stringify({ message: '文件太大' });
    xhr.onload?.();

    await expect(resultPromise).rejects.toThrow('文件太大');
  });
});
