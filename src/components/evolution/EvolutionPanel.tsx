import React, { useEffect, useMemo } from 'react';
import { useEvolutionStore } from '../../store/useEvolutionStore';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useMemeStore } from '../../store/useMemeStore';
import { computeCompressibility } from '../../lib/evolution/compressibility';
import { CompressibilitySparkline } from './CompressibilitySparkline';

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

  // Pre-fetch meme pool on mount
  useEffect(() => {
    if (memePool.length === 0 && !isFetchingMemes) {
      fetchMemePool();
    }
  }, []);

  const operatedCount = placedCubes.filter(c => (cubeOperators[c.id]?.length ?? 0) > 0).length;
  const hasAssembly = placedCubes.length > 0;

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Header + generation counter */}
      <div>
        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>
          Evolution Mode
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 4,
            background: '#334155',
            color: '#e2e8f0',
            fontSize: 11,
            fontWeight: 600,
          }}>
            Gen {generation}
          </span>
          <span style={{ color: '#64748b', fontSize: 10 }}>
            {placedCubes.length} cubes &middot; {operatedCount} modified
          </span>
        </div>
      </div>

      {/* Compressibility sparkline */}
      <div>
        <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 4, fontWeight: 600 }}>
          Compressibility over time
        </div>
        <CompressibilitySparkline log={compressibilityLog} />
        {compressibilityLog.length > 0 && (
          <div style={{
            marginTop: 4,
            fontSize: 9,
            color: compressibilityLog[compressibilityLog.length - 1].delta > 0 ? '#22c55e' : '#ef4444',
          }}>
            Last delta: {compressibilityLog[compressibilityLog.length - 1].delta > 0 ? '+' : ''}
            {compressibilityLog[compressibilityLog.length - 1].delta.toFixed(4)}
            {compressibilityLog[compressibilityLog.length - 1].delta > 0 ? ' (interesting)' : ' (less interesting)'}
          </div>
        )}
      </div>

      {/* Score breakdown */}
      {currentScore.total > 0 && (
        <div style={{ borderTop: '1px solid #334155', paddingTop: 8 }}>
          <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 6, fontWeight: 600 }}>
            Score breakdown
          </div>
          {([
            ['Geometric clustering', currentScore.geometricClustering, '30%'],
            ['Spatial regularity', currentScore.spatialRegularity, '30%'],
            ['Operator sequence', currentScore.operatorSequence, '20%'],
            ['Meme coherence', currentScore.memeCoherence, '20%'],
          ] as const).map(([label, value, weight]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ color: '#64748b', fontSize: 9, width: 90, flexShrink: 0 }}>{label}</span>
              <div style={{
                flex: 1,
                height: 4,
                background: '#334155',
                borderRadius: 2,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${Math.max(1, value * 100)}%`,
                  height: '100%',
                  background: '#60a5fa',
                  borderRadius: 2,
                }} />
              </div>
              <span style={{ color: '#94a3b8', fontSize: 9, width: 28, textAlign: 'right' }}>
                {value.toFixed(2)}
              </span>
              <span style={{ color: '#475569', fontSize: 8, width: 20 }}>
                {weight}
              </span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600 }}>Total</span>
            <span style={{ color: '#e2e8f0', fontSize: 10, fontWeight: 600 }}>{currentScore.total.toFixed(4)}</span>
          </div>
        </div>
      )}

      {/* Error message */}
      {lastError && (
        <div style={{
          padding: 8,
          background: '#7f1d1d',
          borderRadius: 4,
          color: '#fca5a5',
          fontSize: 11,
          lineHeight: 1.4,
        }}>
          {lastError}
        </div>
      )}

      {/* Meme pool status */}
      <div style={{ borderTop: '1px solid #334155', paddingTop: 8 }}>
        <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 4 }}>
          Meme pool: {isFetchingMemes ? 'loading...' : `${memePool.length} memes`}
        </div>
        {memePool.length === 0 && !isFetchingMemes && (
          <button
            onClick={fetchMemePool}
            style={{
              padding: 6,
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 4,
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 10,
              width: '100%',
            }}
          >
            Fetch memes
          </button>
        )}
      </div>

      {/* Generate button */}
      <button
        onClick={generateCandidates}
        disabled={isGenerating || !hasAssembly || memePool.length === 0}
        style={{
          padding: 10,
          background: isGenerating || !hasAssembly || memePool.length === 0 ? '#334155' : '#065f46',
          border: 'none',
          borderRadius: 6,
          color: isGenerating || !hasAssembly || memePool.length === 0 ? '#475569' : 'white',
          cursor: isGenerating || !hasAssembly || memePool.length === 0 ? 'default' : 'pointer',
          fontSize: 12,
          fontWeight: 600,
          width: '100%',
        }}
      >
        {isGenerating ? `Generating ${config.populationSize} candidates...` : 'Generate candidates'}
      </button>

      {/* Candidate list */}
      {candidates.length > 0 && (
        <div style={{ borderTop: '1px solid #334155', paddingTop: 8 }}>
          <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 6, fontWeight: 600 }}>
            Candidates (ranked by interestingness)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                  style={{
                    padding: 8,
                    borderRadius: 6,
                    background: isSelected ? '#1e3a2f' : isPreviewing ? '#1e293b' : '#0f172a',
                    border: `1px solid ${isSelected ? '#22c55e' : isPreviewing ? '#f59e0b' : '#334155'}`,
                    cursor: 'pointer',
                  }}
                >
                  {/* Rank + score */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600 }}>
                      #{idx + 1}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 10,
                        color: candidate.compressionProgress > 0 ? '#22c55e' : candidate.compressionProgress < 0 ? '#ef4444' : '#64748b',
                        fontWeight: 600,
                      }}>
                        {candidate.compressionProgress > 0 ? '+' : ''}
                        {candidate.compressionProgress.toFixed(4)}
                      </span>
                      {/* Mini progress indicator */}
                      <div style={{
                        width: 40,
                        height: 4,
                        background: '#334155',
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${Math.min(100, Math.max(0, (candidate.compressionProgress + 0.5) * 100))}%`,
                          height: '100%',
                          background: candidate.compressionProgress > 0 ? '#22c55e' : '#ef4444',
                          borderRadius: 2,
                        }} />
                      </div>
                    </div>
                  </div>

                  {/* Meme description (truncated) */}
                  <div style={{
                    color: '#cbd5e1',
                    fontSize: 10,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginBottom: 2,
                  }}>
                    {candidate.memeDescription.split('\n')[0]}
                  </div>

                  {/* Target cube + operator */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '1px 6px',
                      borderRadius: 3,
                      background: '#334155',
                      color: '#94a3b8',
                      fontSize: 9,
                    }}>
                      {candidate.cutterConfig.operator}
                    </span>
                    <span style={{
                      padding: '1px 6px',
                      borderRadius: 3,
                      background: '#334155',
                      color: '#94a3b8',
                      fontSize: 9,
                    }}>
                      {candidate.cutterConfig.cutter.type}
                    </span>
                    <span style={{
                      padding: '1px 6px',
                      borderRadius: 3,
                      background: '#334155',
                      color: '#64748b',
                      fontSize: 9,
                    }}>
                      cube {candidate.targetCubeId.slice(-4)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Apply + Undo buttons */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              onClick={applySelected}
              disabled={!selectedCandidateId}
              style={{
                flex: 1,
                padding: 10,
                background: selectedCandidateId ? '#065f46' : '#334155',
                border: 'none',
                borderRadius: 6,
                color: selectedCandidateId ? 'white' : '#475569',
                cursor: selectedCandidateId ? 'pointer' : 'default',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Apply
            </button>
            <button
              onClick={() => {
                previewCandidate(null);
                undoLastGeneration();
              }}
              disabled={generation === 0}
              style={{
                padding: '10px 12px',
                background: generation > 0 ? '#7f1d1d' : '#334155',
                border: 'none',
                borderRadius: 6,
                color: generation > 0 ? 'white' : '#475569',
                cursor: generation > 0 ? 'pointer' : 'default',
                fontSize: 12,
              }}
            >
              Undo
            </button>
          </div>
        </div>
      )}

      {/* Config section */}
      <div style={{ borderTop: '1px solid #334155', paddingTop: 8 }}>
        <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 8, fontWeight: 600 }}>
          Settings
        </div>

        {/* Target strategy */}
        <div style={{ marginBottom: 8 }}>
          <label style={{ color: '#94a3b8', fontSize: 10, display: 'block', marginBottom: 4 }}>
            Target strategy
          </label>
          <select
            value={config.targetCubeStrategy}
            onChange={(e) => setConfig({ targetCubeStrategy: e.target.value as 'random' | 'least-compressed' | 'adaptive' })}
            style={{
              width: '100%',
              padding: 6,
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 4,
              color: 'white',
              fontSize: 11,
              boxSizing: 'border-box',
            }}
          >
            <option value="least-compressed">Least compressed (focus on untouched cubes)</option>
            <option value="adaptive">Adaptive (mix of focused + random)</option>
            <option value="random">Random</option>
          </select>
        </div>

        {/* Population size */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={{ color: '#94a3b8', fontSize: 10 }}>Candidates per generation</label>
            <span style={{ color: '#e2e8f0', fontSize: 10 }}>{config.populationSize}</span>
          </div>
          <input
            type="range"
            min={2}
            max={12}
            step={1}
            value={config.populationSize}
            onChange={(e) => setConfig({ populationSize: parseInt(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>

        {/* Selection pressure */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={{ color: '#94a3b8', fontSize: 10 }}>Algorithm vs. intuition</label>
            <span style={{ color: '#e2e8f0', fontSize: 10 }}>{Math.round(config.selectionPressure * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={config.selectionPressure * 100}
            onChange={(e) => setConfig({ selectionPressure: parseInt(e.target.value) / 100 })}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#475569', marginTop: 2 }}>
            <span>Your choice matters more</span>
            <span>Algorithm decides</span>
          </div>
        </div>

        {/* Meme filter */}
        <div>
          <label style={{ color: '#94a3b8', fontSize: 10, display: 'block', marginBottom: 4 }}>
            Meme tag filter (optional)
          </label>
          <input
            type="text"
            value={config.memePoolFilter || ''}
            onChange={(e) => setConfig({ memePoolFilter: e.target.value || null })}
            placeholder="e.g. architecture"
            style={{
              width: '100%',
              padding: 6,
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 4,
              color: 'white',
              fontSize: 11,
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>
    </div>
  );
};
