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

    expect(settings.load()).toEqual({ provider: 'smms', token: '' });

    settings.save({ provider: 'smms', token: 'secret-token' });

    expect(settings.load()).toEqual({ provider: 'smms', token: 'secret-token' });
  });
});
