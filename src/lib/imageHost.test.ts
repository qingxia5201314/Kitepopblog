import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildImageMarkdown,
  createImageHostSettingsRepository,
  parseSmmsUploadResponse
} from './imageHost';

describe('image host helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('builds markdown image syntax from an uploaded image', () => {
    expect(buildImageMarkdown('Kitepop 封面', 'https://img.example.com/kite.png')).toBe(
      '![Kitepop 封面](https://img.example.com/kite.png)'
    );
  });

  it('parses SM.MS upload response image urls', () => {
    const response = {
      success: true,
      data: {
        url: 'https://s2.loli.net/2026/06/13/kite.png',
        filename: 'kite.png'
      }
    };

    expect(parseSmmsUploadResponse(response)).toEqual({
      url: 'https://s2.loli.net/2026/06/13/kite.png',
      filename: 'kite.png'
    });
  });

  it('persists image host settings without leaking defaults', () => {
    const settings = createImageHostSettingsRepository('kitepop-image-host-test');

    expect(settings.load()).toEqual({
      provider: 'custom',
      token: '',
      uploadUrl: 'https://sm.ms/api/v2/upload',
      fileFieldName: 'smfile',
      urlPath: 'data.url'
    });

    settings.save({
      provider: 'custom',
      token: 'secret-token',
      uploadUrl: 'https://image.example.com/api/upload',
      fileFieldName: 'file',
      urlPath: 'result.url'
    });

    expect(settings.load()).toEqual({
      provider: 'custom',
      token: 'secret-token',
      uploadUrl: 'https://image.example.com/api/upload',
      fileFieldName: 'file',
      urlPath: 'result.url'
    });
  });

  it('reads nested url values by configured response path', async () => {
    const { readValueByPath } = await import('./imageHost');

    expect(readValueByPath({ result: { url: 'https://img.example.com/a.png' } }, 'result.url')).toBe(
      'https://img.example.com/a.png'
    );
  });
});
