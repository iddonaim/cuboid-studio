import React, { useState } from 'react';
import { useEncodingStore } from '../../store/useEncodingStore';
import { MODEL_OPTIONS } from '../../lib/models';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/section';
import { EncodingReadingPanel } from './EncodingReadingPanel';

/**
 * Encode Model lab — run the same photo(s) through several models and compare
 * how each reads the space, before rendering one.
 *
 * Unlike the meme Model lab, there is no side-by-side 3D: results are compared
 * as readings (the five-axis interpretation + reasoning + cube count), and
 * "Show this composition" loads the chosen entry into the single existing
 * preview canvas — from there the normal Load buttons take over. Nothing
 * touches the builder until a result is loaded and then loaded in.
 *
 * The decision protocol that uses this panel lives in docs/MODEL_STRATEGY.md.
 */
export const EncodeModelComparisonPanel: React.FC = () => {
  const multiPhotoEnabled = useEncodingStore(s => s.multiPhotoEnabled);
  const uploadedImages = useEncodingStore(s => s.uploadedImages);
  const uploadedImage = useEncodingStore(s => s.uploadedImage);
  const imagesRestoredOnly = useEncodingStore(s => s.imagesRestoredOnly);
  const isEncoding = useEncodingStore(s => s.isEncoding);
  const isComparingEncode = useEncodingStore(s => s.isComparingEncode);
  const entries = useEncodingStore(s => s.encodeComparisonEntries);
  const runEncodeComparison = useEncodingStore(s => s.runEncodeComparison);
  const showComparisonEntry = useEncodingStore(s => s.showComparisonEntry);
  const clearEncodeComparison = useEncodingStore(s => s.clearEncodeComparison);

  const hasImages = multiPhotoEnabled ? uploadedImages.length > 0 : Boolean(uploadedImage);

  const [selected, setSelected] = useState<Record<string, boolean>>(() => ({
    // Sensible starting pair: the deployed default and its likely successor.
    [MODEL_OPTIONS[0].id]: true,
    [MODEL_OPTIONS[1].id]: true,
  }));

  const chosen = MODEL_OPTIONS.filter(m => selected[m.id]);
  const canRun =
    !isComparingEncode && !isEncoding && hasImages && !imagesRestoredOnly && chosen.length > 0;

  return (
    <Section id="encode-model-lab" title="Model lab">
      <div className="flex flex-col gap-2.5">
        <p className="text-ink-500 text-[11px] leading-relaxed m-0">
          Run the same photo through several models and compare how each reads
          the space before rendering one. Uses the current photos, vocabulary,
          and site context; nothing changes in the 3D scene until you show a
          result and load it in.
        </p>

        {/* Candidate models */}
        <div className="flex flex-col gap-1">
          {MODEL_OPTIONS.map(m => (
            <label
              key={m.id}
              className="flex items-start gap-2 text-[12px] text-ink-700 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={!!selected[m.id]}
                disabled={isComparingEncode}
                onChange={e => setSelected(prev => ({ ...prev, [m.id]: e.target.checked }))}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{m.label}</span>
                {m.note && <span className="text-ink-400 text-[10px] block">{m.note}</span>}
              </span>
            </label>
          ))}
        </div>

        <Button
          onClick={() => runEncodeComparison(chosen.map(m => ({ id: m.id, label: m.label })))}
          disabled={!canRun}
          title={!hasImages ? 'Upload a photo first' : undefined}
          className={`w-full h-auto py-2 text-[12px] font-semibold border-0 ${
            isComparingEncode ? 'bg-ink-200 text-ink-600 cursor-wait' : 'bg-ink-800 hover:bg-ink-700 text-white'
          } ${!canRun && !isComparingEncode ? 'opacity-50' : ''}`}
        >
          {isComparingEncode
            ? 'Comparing…'
            : `Run comparison (${chosen.length} model${chosen.length === 1 ? '' : 's'})`}
        </Button>

        {/* Results */}
        {entries.length > 0 && (
          <div className="flex flex-col gap-2">
            {entries.map(entry => (
              <div
                key={entry.modelId}
                className="p-2 bg-ink-50 border border-ink-200 rounded-md"
              >
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-ink-900 text-[12px] font-semibold">{entry.label}</span>
                  <span className="text-ink-400 text-[10px]">
                    {entry.status === 'running' && 'running…'}
                    {entry.status !== 'running' && entry.elapsedMs != null && `${(entry.elapsedMs / 1000).toFixed(1)}s`}
                  </span>
                </div>

                {entry.status === 'error' && (
                  <div className="text-destructive text-[11px] leading-relaxed break-words">
                    {entry.error}
                  </div>
                )}

                {entry.status === 'done' && (
                  <div className="flex flex-col gap-1.5">
                    <div className="text-ink-600 text-[11px]">
                      {(entry.cubes?.length ?? 0)} cubes
                      {' '}({new Set((entry.cubes ?? []).map(c => c.variationId)).size} unique)
                    </div>
                    {entry.reading ? (
                      <EncodingReadingPanel reading={entry.reading} lexicon={entry.lexicon} />
                    ) : (
                      <p className="text-ink-500 text-[11px] italic m-0">
                        No structured reading returned.
                      </p>
                    )}
                    {entry.reasoning && (
                      <details>
                        <summary className="text-ink-500 text-[10px] cursor-pointer">
                          reasoning
                        </summary>
                        <p className="text-ink-600 text-[11px] leading-relaxed mt-1 mb-0 italic">
                          {entry.reasoning}
                        </p>
                      </details>
                    )}
                    <Button
                      onClick={() => showComparisonEntry(entry.modelId)}
                      disabled={isComparingEncode || isEncoding || !entry.cubes?.length}
                      className="w-full h-auto py-1.5 text-[11px] font-semibold bg-primary hover:bg-primary/85 text-white border-0 disabled:opacity-50"
                    >
                      Show this composition
                    </Button>
                  </div>
                )}
              </div>
            ))}

            <Button
              onClick={clearEncodeComparison}
              disabled={isComparingEncode}
              className="w-full h-auto py-1.5 text-[11px] bg-ink-100 hover:bg-ink-200 text-ink-600 border border-ink-200"
            >
              Clear comparison
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
};
