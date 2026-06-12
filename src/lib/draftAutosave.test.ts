import { beforeEach, describe, expect, it } from 'vitest';
import { createDraftAutosaveRepository } from './draftAutosave';

describe('draft autosave repository', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves, loads, and clears an editor draft', () => {
    const repository = createDraftAutosaveRepository('kitepop-draft-test');
    const draft = {
      title: '自动保存测试',
      summary: '避免刷新丢内容',
      category: 'notes' as const,
      tags: ['草稿'],
      content: '正文',
      status: 'draft' as const,
      cover: 'notes' as const,
      coverImage: 'https://img.example.com/cover.png'
    };

    repository.save(draft);
    expect(repository.load()).toEqual(draft);

    repository.clear();
    expect(repository.load()).toBeUndefined();
  });
});
