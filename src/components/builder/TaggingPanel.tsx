import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useMemeStore } from '../../store/useMemeStore';
import { useTagStore, Tag } from '../../store/useTagStore';

interface TaggingPanelProps {
  cubeIds: string[];
}

export const TaggingPanel: React.FC<TaggingPanelProps> = ({ cubeIds }) => {
  const lastPass1 = useMemeStore(s => s.lastPass1);
  const {
    compositionTags,
    cuboidTags,
    addCompositionTag,
    removeCompositionTag,
    addCuboidTag,
    removeCuboidTag,
    getAllUsedWords,
  } = useTagStore();

  const [word, setWord] = useState('');
  const [intensity, setIntensity] = useState('');

  const isCuboidContext = cubeIds.length > 0;
  const isSingle = cubeIds.length === 1;

  const contextLabel = isCuboidContext
    ? `${cubeIds.length} cuboid${cubeIds.length > 1 ? 's' : ''}`
    : 'Composition';

  const displayTags: Tag[] = isSingle
    ? (cuboidTags[cubeIds[0]] ?? [])
    : isCuboidContext
    ? []
    : compositionTags;

  const canSubmit = word.trim().length > 0 && intensity.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const tag: Tag = { word: word.trim(), intensity: intensity.trim() };
    if (isCuboidContext) {
      cubeIds.forEach((id) => addCuboidTag(id, tag));
    } else {
      addCompositionTag(tag);
    }
    setWord('');
    setIntensity('');
  };

  const affectWords = lastPass1?.functional_affects ?? [];
  const usedWords = getAllUsedWords();
  const hints = Array.from(new Set([...affectWords, ...usedWords])).filter(
    (w) => w.toLowerCase() !== word.toLowerCase(),
  );

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 w-52">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
        Tags — {contextLabel}
      </p>

      {/* Existing tags */}
      {displayTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {displayTags.map((tag, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] bg-slate-800 border border-slate-600 text-slate-300"
            >
              <span>{tag.word}</span>
              <span className="text-slate-500">· {tag.intensity}</span>
              <button
                type="button"
                onClick={() =>
                  isSingle ? removeCuboidTag(cubeIds[0], i) : removeCompositionTag(i)
                }
                className="ml-0.5 text-slate-500 hover:text-slate-300 leading-none"
                aria-label={`Remove ${tag.word}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {cubeIds.length > 1 && (
        <p className="text-[10px] text-slate-500 mb-2">
          Adds to all {cubeIds.length} selected cuboids.
        </p>
      )}

      {/* Hint chips */}
      {hints.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {hints.slice(0, 10).map((hint) => (
            <button
              key={hint}
              type="button"
              onClick={() => setWord(hint)}
              className="rounded px-1.5 py-0.5 text-[10px] bg-slate-700/60 border border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-400 transition-colors"
            >
              {hint}
            </button>
          ))}
        </div>
      )}

      {/* Word field */}
      <input
        type="text"
        value={word}
        onChange={(e) => setWord(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        placeholder="What does this feel like?"
        className="w-full rounded px-2 py-1.5 text-[11px] bg-slate-800 border border-slate-600 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-slate-400 mb-1.5"
      />

      {/* Intensity field + submit */}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={intensity}
          onChange={(e) => setIntensity(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="How much?"
          className="flex-1 min-w-0 rounded px-2 py-1.5 text-[11px] bg-slate-800 border border-slate-600 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-slate-400"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded px-2.5 py-1.5 text-[12px] font-semibold bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Add tag"
        >
          +
        </button>
      </div>
    </div>
  );
};
