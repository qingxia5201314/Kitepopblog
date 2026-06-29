import { describe, expect, it } from 'vitest';
import { DEFAULT_FILE_UPLOAD_LIMIT_BYTES, getFileUploadLimitBytes } from './routes/files.mjs';

describe('file upload limit', () => {
  it('allows a 205 MB video with the default limit', () => {
    expect(DEFAULT_FILE_UPLOAD_LIMIT_BYTES).toBeGreaterThanOrEqual(300 * 1024 * 1024);
    expect(getFileUploadLimitBytes({})).toBe(DEFAULT_FILE_UPLOAD_LIMIT_BYTES);
    expect(getFileUploadLimitBytes({})).toBeGreaterThan(205 * 1024 * 1024);
  });

  it('keeps FILE_UPLOAD_LIMIT as an explicit override', () => {
    expect(getFileUploadLimitBytes({ FILE_UPLOAD_LIMIT: '1234' })).toBe(1234);
  });
});
