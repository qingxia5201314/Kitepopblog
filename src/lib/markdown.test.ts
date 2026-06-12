import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './markdown';

describe('markdown parser', () => {
  it('parses headings, paragraphs, and blockquotes', () => {
    expect(parseMarkdown('# 标题\n\n> 引用\n\n正文')).toEqual([
      { type: 'heading', level: 1, text: '标题' },
      { type: 'blockquote', text: '引用' },
      { type: 'paragraph', text: '正文' }
    ]);
  });

  it('groups unordered and ordered lists', () => {
    expect(parseMarkdown('- A\n- B\n\n1. One\n2. Two')).toEqual([
      { type: 'list', ordered: false, items: ['A', 'B'] },
      { type: 'list', ordered: true, items: ['One', 'Two'] }
    ]);
  });

  it('keeps fenced code blocks as one markdown block', () => {
    expect(parseMarkdown('```bash\nnpm run build\nnpm test\n```')).toEqual([
      { type: 'code', language: 'bash', code: 'npm run build\nnpm test' }
    ]);
  });

  it('parses standalone markdown images', () => {
    expect(parseMarkdown('![封面](https://img.example.com/a.png)')).toEqual([
      { type: 'image', alt: '封面', url: 'https://img.example.com/a.png' }
    ]);
  });
});
