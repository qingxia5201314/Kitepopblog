import { describe, expect, it } from 'vitest';
import { createRawFileHeaders } from './fileDownloadHeaders.mjs';

describe('file download headers', () => {
  it('keeps the original filename for browser downloads', () => {
    const headers = createRawFileHeaders({
      originalName: 'pass.php',
      contentType: 'application/octet-stream',
      sizeBytes: 38
    });

    expect(headers['content-type']).toBe('application/octet-stream');
    expect(headers['content-length']).toBe(38);
    expect(headers['content-disposition']).toContain('inline');
    expect(headers['content-disposition']).toContain('filename="pass.php"');
    expect(headers['content-disposition']).toContain("filename*=UTF-8''pass.php");
    expect(headers['x-content-type-options']).toBe('nosniff');
  });
});
