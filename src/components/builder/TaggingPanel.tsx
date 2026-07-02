import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useMemeStore } from '../../store/useMemeStore';
import { useTagStore, Tag, TagIntensity } from '../../store/useTagStore';

const INTENSITIES: TagIntensity[] = ['a little', 'moderate', 'a lot'];

export const TaggingPanel: React.FC = () => {
  const selectedCubeIds = useBuilderStore(s => s.selectedCubeIds);
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
  const [intensity, setIntensity] = useState<TagIntensity | null>(null);

  const isCuboidContext = selectedCubeIds.length > 0;
  const isSingle = selectedCubeIds.length === 1;

  const contextLabel = isCuboidContext
    ? `${selectedCubeIds.length} cuboid${selectedCubeIds.length > 1 ? 's' : ''}`
    : 'Composition';

  // Tags shown when one cuboid is selected or composition context
  const displayTags: Tag[] = isSingle
    ? (cuboidTags[selectedCubeIds[0]] ?? [])
    : isCuboidContext
    ? []
    : compositionTags;

  const canSubmit = word.trim().length > 0 && intensity !== null;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const tag: Tag = { word: word.trim(), intensity: intensity! };
    if (isCuboidContext) {
      selectedCubeIds.forEach((id) => addCuboidTag(id, tag));
    } else {
      addCompositionTag(tag);
    }
    setWord('');
    setIntensity(null);
  };

  // Hint chips: Pass-1 affects + previously used words, de-duped
  const affectWords = lastPass1?.functional_affects ?? [];
  const usedWords = getAllUsedWords();
  const hints = Array.from(new Set([...affectWords, ...usedWords])).filter(
    (w) => w.toLowerCase() !== word.toLowerCase(),
  );

  return (
    <div className="mt-2 pt-2 border-t border-ink-200/60">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-600 mb-2">
        Tags — {contextLabel}
      </p>

      {/* Existing tags (single cuboid or composition) */}
      {displayTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {displayTags.map((tag, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] bg-ink-100 border border-ink-300 text-ink-700"
            >
              <span>{tag.word}</span>
              <span className="text-ink-500">· {tag.intensity}</span>
              <button
                type="button"
                onClick={() =>
                  isSingle
                    ? removeCuboidTag(selectedCubeIds[0], i)
                    : removeCompositionTag(i)
                }
                className="ml-0.5 text-ink-500 hover:text-ink-700 leading-none"
                aria-label={`Remove tag ${tag.word}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Multi-select info */}
      {selectedCubeIds.length > 1 && (
        <p className="text-[10px] text-ink-500 mb-2">
          Tag will be added to all {selectedCubeIds.length} selected cuboids.
        </p>
      )}

      {/* Hint chips */}
      {hints.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {hints.slice(0, 12).map((hint) => (
            <button
              key={hint}
              type="button"
              onClick={() => setWord(hint)}
              className="rounded px-1.5 py-0.5 text-[10px] bg-ink-200/60 border border-ink-300 text-ink-600 hover:text-ink-800 hover:border-ink-400 transition-colors"
            >
              {hint}
            </button>
          ))}
        </div>
      )}

      {/* Word input + submit */}
      <div className="flex gap-1.5 mb-2">
        <input
          type="text"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="What does this feel like?"
          className="flex-1 min-w-0 rounded px-2 py-1.5 text-[11px] bg-ink-100 border border-ink-300 text-ink-800 placeholder:text-ink-500 focus:outline-none focus:border-ink-400"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded px-2.5 py-1.5 text-[12px] font-semibold bg-ink-200 border border-ink-300 text-ink-700 hover:bg-ink-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Add tag"
        >
          +
        </button>
      </div>

      {/* Intensity selector */}
      <div className="flex gap-1">
        {INTENSITIES.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setIntensity(intensity === level ? null : level)}
            className={`flex-1 rounded px-1 py-1.5 text-[9px] border transition-colors ${
              intensity === level
                ? 'bg-primary border-primary text-primary font-semibold'
                : 'bg-ink-100 border-ink-300 text-ink-600 hover:border-ink-400'
            }`}
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  );
};
