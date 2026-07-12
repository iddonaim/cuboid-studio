import React, { useState } from 'react';
import { useMemeStore } from '../../store/useMemeStore';
import { useBuilderStore } from '../../store/useBuilderStore';
import { MODEL_OPTIONS } from '../../lib/models';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/section';
import type { ConfidenceVector } from '../../lib/operators/types';

/** Confidence vector at a glance: four labelled mini-bars, same axis order
 *  as the full record drawer (RC, SR, AC, OS). */
const ConfidenceBars: React.FC<{ vector: ConfidenceVector }> = ({ vector }) => {
  const axes: Array<{ abbr: string; value: number }> = [
    { abbr: 'RC', value: vector.rhetorical_clarity },
    { abbr: 'SR', value: vector.site_resonance },
    { abbr: 'AC', value: vector.affective_coherence },
    { abbr: 'OS', value: vector.operational_specificity },
  ];
  return (
    <div className="flex gap-2">
      {axes.map(({ abbr, value }) => (
        <div key={abbr} className="flex-1">
          <div className="flex justify-between text-[9px] text-ink-500 mb-0.5">
            <span>{abbr}</span>
            <span>{value.toFixed(2)}</span>
          </div>
          <div className="h-1 bg-ink-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Model lab — run the same meme (and active site context / lexicon) through
 * several models and read the results side by side before applying one.
 * Nothing touches the geometry until "Apply this reading" is clicked; the
 * chosen entry then flows through the exact same pipeline as a normal
 * translation, so the record keeps full provenance including the model id.
 *
 * The decision protocol that uses this panel lives in docs/MODEL_STRATEGY.md.
 */
export const ModelComparisonPanel: React.FC = () => {
  const memeDescription = useMemeStore(s => s.memeDescription);
  const isTranslating = useMemeStore(s => s.isTranslating);
  const isComparing = useMemeStore(s => s.isComparing);
  const comparisonEntries = useMemeStore(s => s.comparisonEntries);
  const runModelComparison = useMemeStore(s => s.runModelComparison);
  const applyComparisonEntry = useMemeStore(s => s.applyComparisonEntry);
  const clearComparison = useMemeStore(s => s.clearComparison);
  const targetCubeId = useMemeStore(s => s.targetCubeId);
  const placedCubes = useBuilderStore(s => s.placedCubes);

  const hasAssembly = placedCubes.length > 0;
  const canApply = !hasAssembly || !!targetCubeId;

  const [selected, setSelected] = useState<Record<string, boolean>>(() => ({
    // Sensible starting pair: the current default and its likely successor.
    [MODEL_OPTIONS[0].id]: true,
    [MODEL_OPTIONS[1].id]: true,
  }));

  const chosen = MODEL_OPTIONS.filter(m => selected[m.id]);
  const canRun = !isComparing && !isTranslating && memeDescription.trim().length > 0 && chosen.length > 0;

  return (
    <Section id="pata-model-lab" title="Model lab">
      <div className="flex flex-col gap-2.5">
        <p className="text-ink-500 text-[11px] leading-relaxed m-0">
          Run the same meme through several models and compare their readings
          before applying one. Uses the current site context and vocabulary;
          nothing changes in the 3D scene until you apply a result. Applying
          a different reading swaps it in — the lab undoes its own previous
          apply first, never your manual work.
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
                disabled={isComparing}
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
          onClick={() => runModelComparison(chosen.map(m => ({ id: m.id, label: m.label })))}
          disabled={!canRun}
          className={`w-full h-auto py-2 text-[12px] font-semibold border-0 ${
            isComparing ? 'bg-ink-200 text-ink-600 cursor-wait' : 'bg-ink-800 hover:bg-ink-700 text-white'
          } ${!canRun && !isComparing ? 'opacity-50' : ''}`}
        >
          {isComparing
            ? 'Comparing…'
            : `Run comparison (${chosen.length} model${chosen.length === 1 ? '' : 's'})`}
        </Button>

        {/* Results */}
        {comparisonEntries.length > 0 && (
          <div className="flex flex-col gap-2">
            {comparisonEntries.map(entry => (
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

                {entry.status === 'done' && entry.result && (
                  <div className="flex flex-col gap-1.5">
                    {entry.pass1?.meme_summary && (
                      <p className="text-ink-600 text-[11px] leading-relaxed m-0">
                        {entry.pass1.meme_summary}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1 text-[10px]">
                      <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded font-medium">
                        {entry.result.operator}
                      </span>
                      <span className="px-1.5 py-0.5 bg-ink-100 text-ink-600 rounded">
                        cutter: {entry.result.cutter.type}
                      </span>
                      <span className="px-1.5 py-0.5 bg-ink-100 text-ink-600 rounded">
                        mag {entry.result.magnitude.toFixed(2)}
                      </span>
                      {entry.result.targets.slice(0, 3).map(t => (
                        <span key={t} className="px-1.5 py-0.5 bg-ink-100 text-ink-500 rounded">
                          {t}
                        </span>
                      ))}
                    </div>
                    {entry.confidenceVector && <ConfidenceBars vector={entry.confidenceVector} />}
                    {entry.result.reasoning && (
                      <details>
                        <summary className="text-ink-500 text-[10px] cursor-pointer">
                          reasoning
                        </summary>
                        <p className="text-ink-600 text-[11px] leading-relaxed mt-1 mb-0">
                          {entry.result.reasoning}
                        </p>
                      </details>
                    )}
                    <Button
                      onClick={() => applyComparisonEntry(entry.modelId)}
                      disabled={isTranslating || isComparing || !canApply}
                      className="w-full h-auto py-1.5 text-[11px] font-semibold bg-primary hover:bg-primary/85 text-white border-0 disabled:opacity-50"
                    >
                      {canApply ? 'Apply this reading' : 'Select a cube first'}
                    </Button>
                  </div>
                )}
              </div>
            ))}

            <Button
              onClick={clearComparison}
              disabled={isComparing}
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
