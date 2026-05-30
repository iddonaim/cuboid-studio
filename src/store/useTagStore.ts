import { create } from 'zustand';

export interface Tag {
  word: string;
  intensity: string;
}

interface TagState {
  compositionTags: Tag[];
  cuboidTags: Record<string, Tag[]>;
  addCompositionTag: (tag: Tag) => void;
  removeCompositionTag: (index: number) => void;
  addCuboidTag: (cubeId: string, tag: Tag) => void;
  removeCuboidTag: (cubeId: string, index: number) => void;
  clearCuboidTags: (cubeId: string) => void;
  getAllUsedWords: () => string[];
  getTagsForCuboids: (ids: string[]) => Tag[];
}

export const useTagStore = create<TagState>((set, get) => ({
  compositionTags: [],
  cuboidTags: {},

  addCompositionTag: (tag) =>
    set((s) => ({ compositionTags: [...s.compositionTags, tag] })),

  removeCompositionTag: (index) =>
    set((s) => ({ compositionTags: s.compositionTags.filter((_, i) => i !== index) })),

  addCuboidTag: (cubeId, tag) =>
    set((s) => ({
      cuboidTags: {
        ...s.cuboidTags,
        [cubeId]: [...(s.cuboidTags[cubeId] ?? []), tag],
      },
    })),

  removeCuboidTag: (cubeId, index) =>
    set((s) => ({
      cuboidTags: {
        ...s.cuboidTags,
        [cubeId]: (s.cuboidTags[cubeId] ?? []).filter((_, i) => i !== index),
      },
    })),

  clearCuboidTags: (cubeId) =>
    set((s) => {
      const next = { ...s.cuboidTags };
      delete next[cubeId];
      return { cuboidTags: next };
    }),

  getAllUsedWords: () => {
    const { compositionTags, cuboidTags } = get();
    const words = new Set<string>();
    compositionTags.forEach((t) => words.add(t.word));
    Object.values(cuboidTags).forEach((tags) => tags.forEach((t) => words.add(t.word)));
    return Array.from(words);
  },

  getTagsForCuboids: (ids) => {
    const { cuboidTags } = get();
    const seen = new Set<string>();
    const result: Tag[] = [];
    for (const id of ids) {
      for (const tag of cuboidTags[id] ?? []) {
        const key = `${tag.word}:${tag.intensity}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push(tag);
        }
      }
    }
    return result;
  },
}));
