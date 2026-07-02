import React, { useEffect, useMemo } from 'react';
import { useEvolutionStore } from '../../store/useEvolutionStore';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useMemeStore } from '../../store/useMemeStore';
import { computeCompressibility } from '../../lib/evolution/compressibility';
import { CompressibilitySparkline } from './CompressibilitySparkline';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { SectionCutControls } from '../viewport/SectionCutControls';

/**
 * Evolution Mode sidebar panel.
 *
 * How it works (plain english):
 *
 *   1. The user builds an assembly of cubes in Builder mode.
 *   2. They switch to Evolution mode.  The panel pre-fetches a batch of memes
 *      from the archthesis database to sample from.
 *   3. They click "Generate" — the engine picks target cubes (preferring
 *      under-modified ones), samples random memes, and fires parallel Claude
 *      API calls to translate each meme into a boolean cut.
 *   4. Each candidate is scored by *compression progress*: how much would
 *      applying this cut increase the overall regularity (describability)
 *      of the assembly?  Candidates are ranked best-first.
 *   5. The user clicks a candidate to preview it in the 3D viewport, then
 *      clicks "Apply" to commit.  The sparkline tracks the score over time.
 *   6. Repeat — each generation builds on the last, steering the assembly
 *      toward structured novelty.
 */
export const EvolutionPanel: React.FC = () => {
  const generation = useEvolutionStore(s => s.generation);
  const candidates = useEvolutionStore(s => s.candidates);
  const compressibilityLog = useEvolutionStore(s => s.compressibilityLog);
  const config = useEvolutionStore(s => s.config);
  const isGenerating = useEvolutionStore(s => s.isGenerating);
  const generationPhase = useEvolutionStore(s => s.generationPhase);
  const selectedCandidateId = useEvolutionStore(s => s.selectedCandidateId);
  const previewCandidateId = useEvolutionStore(s => s.previewCandidateId);
  const lastError = useEvolutionStore(s => s.lastError);
  const memePool = useEvolutionStore(s => s.memePool);
  const isFetchingMemes = useEvolutionStore(s => s.isFetchingMemes);

  const setConfig = useEvolutionStore(s => s.setConfig);
  const fetchMemePool = useEvolutionStore(s => s.fetchMemePool);
  const generateCandidates = useEvolutionStore(s => s.generateCandidates);
  const previewCandidate = useEvolutionStore(s => s.previewCandidate);
  const selectCandidate = useEvolutionStore(s => s.selectCandidate);
  const applySelected = useEvolutionStore(s => s.applySelected);
  const undoLastGeneration = useEvolutionStore(s => s.undoLastGeneration);

  const placedCubes = useBuilderStore(s => s.placedCubes);
  const cubeOperators = useMemeStore(s => s.cubeOperators);

  // Live score breakdown
  const currentScore = useMemo(
    () => computeCompressibility(placedCubes, cubeOperators),
    [placedCubes, cubeOperators]
  );

  // Pre-fetch meme pool on mount and when re-entering evolution mode
  useEffect(() => {
    if (memePool.length === 0 && !isFetchingMemes) {
      fetchMemePool();
    }
  }, [memePool.length, isFetchingMemes, fetchMemePool]);

  const operatedCount = placedCubes.filter(c => (cubeOperators[c.id]?.length ?? 0) > 0).length;
  const hasAssembly = placedCubes.length > 0;
  const generateDisabled = isGenerating || !hasAssembly || memePool.length === 0;

  return (
    <div className="flex-1 overflow-y-auto flex flex-col gap-2.5">

      {/* Header + generation counter */}
      <div>
        <div className="text-ink-600 text-[11px] mb-1">Evolution Mode</div>
        <div className="flex items-center gap-2">
          <span className="inline-block px-2 py-0.5 rounded bg-ink-200 text-ink-800 text-[11px] font-semibold">
            Gen {generation}
          </span>
          <span className="text-ink-500 text-[10px]">
            {placedCubes.length} cubes &middot; {operatedCount} modified
          </span>
        </div>
      </div>

      {/* Compressibility sparkline */}
      <div>
        <div className="text-ink-600 text-[10px] font-semibold mb-1">
          Compressibility over time
        </div>
        <CompressibilitySparkline log={compressibilityLog} />
        {compressibilityLog.length > 0 && (
          <div className={`mt-1 text-[9px] ${
            compressibilityLog[compressibilityLog.length - 1].delta > 0
              ? 'text-green-600'
              : 'text-destructive'
          }`}>
            Last delta: {compressibilityLog[compressibilityLog.length - 1].delta > 0 ? '+' : ''}
            {compressibilityLog[compressibilityLog.length - 1].delta.toFixed(4)}
            {compressibilityLog[compressibilityLog.length - 1].delta > 0 ? ' (interesting)' : ' (less interesting)'}
          </div>
        )}
      </div>

      {/* Score breakdown */}
      {currentScore.total > 0 && (
        <div className="border-t border-ink-200 pt-2">
          <div className="text-ink-600 text-[10px] font-semibold mb-1.5">Score breakdown</div>
          {([
            ['Geometric clustering', currentScore.geometricClustering, '30%'],
            ['Spatial regularity', currentScore.spatialRegularity, '30%'],
            ['Operator sequence', currentScore.operatorSequence, '20%'],
            ['Meme coherence', currentScore.memeCoherence, '20%'],
          ] as const).map(([label, value, weight]) => (
            <div key={label} className="flex items-center gap-1.5 mb-0.5">
              <span className="text-ink-500 text-[9px] w-[90px] flex-shrink-0">{label}</span>
              <div className="flex-1 h-1 bg-ink-200 rounded overflow-hidden">
                <div
                  className="h-full bg-primary/70 rounded"
                  style={{ width: `${Math.max(1, value * 100)}%` }}
                />
              </div>
              <span className="text-ink-600 text-[9px] w-7 text-right">{value.toFixed(2)}</span>
              <span className="text-ink-400 text-[8px] w-5">{weight}</span>
            </div>
          ))}
          <div className="flex justify-between mt-1">
            <span className="text-ink-600 text-[10px] font-semibold">Total</span>
            <span className="text-ink-800 text-[10px] font-semibold">{currentScore.total.toFixed(4)}</span>
          </div>
        </div>
      )}

      {/* Error message */}
      {lastError && (
        <div className="p-2 bg-destructive/10 rounded text-destructive text-[11px] leading-relaxed">
          {lastError}
        </div>
      )}

      {/* Meme pool status */}
      <div className="border-t border-ink-200 pt-2">
        <div className="text-ink-600 text-[10px] mb-1">
          Meme pool: {isFetchingMemes ? 'loading...' : `${memePool.length} memes`}
        </div>
        {memePool.length === 0 && !isFetchingMemes && (
          <button
            onClick={fetchMemePool}
            className="w-full py-1.5 bg-ink-100 border border-ink-200 rounded text-ink-600 cursor-pointer text-[10px]"
          >
            Fetch memes
          </button>
        )}
      </div>

      {/* Generate button */}
      <Button
        onClick={generateCandidates}
        disabled={generateDisabled}
        className={`w-full h-auto py-2.5 text-xs font-semibold border-0 ${
          generateDisabled
            ? 'bg-ink-200 text-ink-500 cursor-default'
            : 'bg-primary hover:bg-primary/85 text-white'
        }`}
      >
        {isGenerating
          ? (generationPhase === 'scoring' ? 'Scoring candidates...' : 'Reading memes...')
          : 'Generate candidates'}
      </Button>

      {/* Candidate list */}
      {candidates.length > 0 && (
        <div className="border-t border-ink-200 pt-2">
          <div className="text-ink-600 text-[10px] font-semibold mb-1.5">
            Candidates (ranked by interestingness)
          </div>
          <div className="flex flex-col gap-1">
            {candidates.map((candidate, idx) => {
              const isSelected = selectedCandidateId === candidate.id;
              const isPreviewing = previewCandidateId === candidate.id;
              return (
                <div
                  key={candidate.id}
                  onClick={() => {
                    previewCandidate(candidate.id);
                    selectCandidate(candidate.id);
                  }}
                  className={`p-2 rounded-md border cursor-pointer ${
                    isSelected
                      ? 'bg-green-50 border-green-600/50'
                      : isPreviewing
                      ? 'bg-ink-100 border-amber-500'
                      : 'bg-ink-100 border-ink-200'
                  }`}
                >
                  {/* Rank + score */}
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-ink-600 text-[10px] font-semibold">#{idx + 1}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-semibold ${
                        candidate.compressionProgress > 0
                          ? 'text-green-600'
                          : candidate.compressionProgress < 0
                          ? 'text-destructive'
                          : 'text-ink-500'
                      }`}>
                        {candidate.compressionProgress > 0 ? '+' : ''}
                        {candidate.compressionProgress.toFixed(4)}
                      </span>
                      <div className="w-10 h-1 bg-ink-200 rounded overflow-hidden">
                        <div
                          className={`h-full rounded ${candidate.compressionProgress > 0 ? 'bg-green-500' : 'bg-destructive'}`}
                          style={{ width: `${Math.min(100, Math.max(0, (candidate.compressionProgress + 0.5) * 100))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Meme summary (pass1) or fallback to raw description */}
                  <div className="text-ink-700 text-[10px] truncate mb-0.5">
                    {candidate.pass1?.meme_summary || candidate.memeDescription.split('\n')[0]}
                  </div>

                  {/* Rhetorical moves (pass1) */}
                  {candidate.pass1?.rhetorical_moves && candidate.pass1.rhetorical_moves.length > 0 && (
                    <div className="flex gap-1 flex-wrap mb-0.5">
                      {candidate.pass1.rhetorical_moves.map((move, i) => (
                        <span key={i} className="px-1.5 py-px rounded bg-violet-950 text-violet-400 text-[9px]">
                          {move}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Functional affects (pass1) */}
                  {candidate.pass1?.functional_affects && candidate.pass1.functional_affects.length > 0 && (
                    <div className="flex gap-1 flex-wrap mb-0.5">
                      {candidate.pass1.functional_affects.map((affect, i) => (
                        <span key={i} className="px-1.5 py-px rounded bg-amber-50 text-amber-600 text-[9px]">
                          {affect}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Target cube + operator (pass2) */}
                  <div className="flex gap-1 flex-wrap">
                    <span className="px-1.5 py-px rounded bg-ink-200 text-ink-600 text-[9px]">
                      {candidate.cutterConfig.operator}
                    </span>
                    <span className="px-1.5 py-px rounded bg-ink-200 text-ink-600 text-[9px]">
                      {candidate.cutterConfig.cutter.type}
                    </span>
                    <span className="px-1.5 py-px rounded bg-ink-200 text-ink-500 text-[9px]">
                      cube {candidate.targetCubeId.slice(-4)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Apply + Undo buttons */}
          <div className="flex gap-1.5 mt-2">
            <Button
              onClick={applySelected}
              disabled={!selectedCandidateId}
              className={`flex-1 h-auto py-2.5 text-xs font-semibold border-0 ${
                selectedCandidateId
                  ? 'bg-primary hover:bg-primary/85 text-white'
                  : 'bg-ink-200 text-ink-500 cursor-default'
              }`}
            >
              Apply
            </Button>
            <Button
              onClick={() => {
                previewCandidate(null);
                undoLastGeneration();
              }}
              disabled={generation === 0}
              className={`h-auto py-2.5 px-3 text-xs border-0 ${
                generation > 0
                  ? 'bg-destructive/10 hover:bg-destructive/20 text-white'
                  : 'bg-ink-200 text-ink-500 cursor-default'
              }`}
            >
              Undo
            </Button>
          </div>
        </div>
      )}

      <SectionCutControls />

      {/* Config section */}
      <div className="pb-2">
        <div className="text-ink-600 text-[10px] font-semibold mb-2">Settings</div>

        {/* Target strategy */}
        <div className="mb-2">
          <label className="text-ink-600 text-[10px] block mb-1">Target strategy</label>
          <select
            value={config.targetCubeStrategy}
            onChange={(e) => setConfig({ targetCubeStrategy: e.target.value as 'random' | 'least-compressed' | 'adaptive' })}
            className="w-full px-2 py-1.5 bg-ink-100 border border-ink-200 rounded text-ink-900 text-[11px] box-border"
          >
            <option value="least-compressed">Least compressed (focus on untouched cubes)</option>
            <option value="adaptive">Adaptive (mix of focused + random)</option>
            <option value="random">Random</option>
          </select>
        </div>

        {/* Population size */}
        <div className="mb-2">
          <div className="flex justify-between mb-1">
            <label className="text-ink-600 text-[10px]">Candidates per generation</label>
            <span className="text-ink-800 text-[10px]">{config.populationSize}</span>
          </div>
          <Slider
            min={2}
            max={12}
            step={1}
            value={[config.populationSize]}
            onValueChange={([v]) => setConfig({ populationSize: v })}
          />
        </div>

        {/* Selection pressure */}
        <div className="mb-2">
          <div className="flex justify-between mb-1">
            <label className="text-ink-600 text-[10px]">Algorithm vs. intuition</label>
            <span className="text-ink-800 text-[10px]">{Math.round(config.selectionPressure * 100)}%</span>
          </div>
          <Slider
            min={0}
            max={100}
            step={5}
            value={[config.selectionPressure * 100]}
            onValueChange={([v]) => setConfig({ selectionPressure: v / 100 })}
          />
          <div className="flex justify-between text-[9px] text-ink-400 mt-0.5">
            <span>Your choice matters more</span>
            <span>Algorithm decides</span>
          </div>
        </div>

        {/* Meme filter */}
        <div>
          <label className="text-ink-600 text-[10px] block mb-1">Meme tag filter (optional)</label>
          <input
            type="text"
            value={config.memePoolFilter || ''}
            onChange={(e) => setConfig({ memePoolFilter: e.target.value || null })}
            placeholder="e.g. architecture"
            className="w-full px-2 py-1.5 bg-ink-100 border border-ink-200 rounded text-ink-900 text-[11px] box-border"
          />
        </div>
      </div>
    </div>
  );
};
