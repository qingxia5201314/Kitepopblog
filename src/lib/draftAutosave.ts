import { BlogPostDraft } from './blog';

export interface DraftAutosaveRepository {
  load(): BlogPostDraft | undefined;
  save(draft: BlogPostDraft): void;
  clear(): void;
}

export function createDraftAutosaveRepository(storageKey = 'kitepop-editor-draft'): DraftAutosaveRepository {
  return {
    load() {
      const value = localStorage.getItem(storageKey);
      if (!value) return undefined;

      try {
        return JSON.parse(value) as BlogPostDraft;
      } catch {
        return undefined;
      }
    },

    save(draft) {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    },

    clear() {
      localStorage.removeItem(storageKey);
    }
  };
}
