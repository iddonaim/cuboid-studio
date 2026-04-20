import React, { useState, useEffect } from 'react';
import { useMemeStore } from '../../store/useMemeStore';
import { useBuilderStore } from '../../store/useBuilderStore';
import { CUBE_VARIATIONS } from '../../lib/cube/specifications';
import { ArchthesisBrowser } from './ArchthesisBrowser';
import { SiteContextCurator } from './SiteContextCurator';
import { getActiveSiteContext } from '../../lib/storage/siteContext';
import type { CuboidMemeInput, ArchthesisMeme } from '../../types/archthesis';

export const MemeInputPanel: React.FC = () => {
  const memeDescription = useMemeStore(s => s.memeDescription);
  const setMemeDescription = useMemeStore(s => s.setMemeDescription);
  const locationTag = useMemeStore(s => s.locationTag);
  const setLocationTag = useMemeStore(s => s.setLocationTag);
  const engagementLevel = useMemeStore(s => s.engagementLevel);
  const setEngagementLevel = useMemeStore(s => s.setEngagementLevel);
  const passMode = useMemeStore(s => s.passMode);
  const setPassMode = useMemeStore(s => s.setPassMode);
  const isTranslating = useMemeStore(s => s.isTranslating);
  const lastError = useMemeStore(s => s.lastError);
  const translate = useMemeStore(s => s.translate);
  const baseVariationId = useMemeStore(s => s.baseVariationId);
  const setBaseVariation = useMemeStore(s => s.setBaseVariation);
  const initWorkingCube = useMemeStore(s => s.initWorkingCube);
  const selectedMemeImageUrl = useMemeStore(s => s.selectedMemeImageUrl);
  const selectedMemeTitle = useMemeStore(s => s.selectedMemeTitle);
  const setSelectedMeme = useMemeStore(s => s.setSelectedMeme);
  const targetCubeId = useMemeStore(s => s.targetCubeId);

  const placedCubes = useBuilderStore(s => s.placedCubes);
  const hasAssembly = placedCubes.length > 0;
  const targetCube = placedCubes.find(c => c.id === targetCubeId);

  const [showBrowser, setShowBrowser] = useState(false);
  const [showSiteContext, setShowSiteContext] = useState(false);
  const activeSiteContext = getActiveSiteContext();

  const handleArchthesisSelect = (input: CuboidMemeInput, meme: ArchthesisMeme) => {
    setMemeDescription(input.memeDescription);
    setLocationTag(input.locationTag || '');
    setEngagementLevel(input.engagementLevel);
    setSelectedMeme(meme.imageUrl, meme.topText || meme.description?.slice(0, 50) || meme.id);
  };

  // Init working cube on mount
  useEffect(() => {
    initWorkingCube();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Assembly mode: target cube indicator */}
      {hasAssembly && (
        <div style={{
          padding: 8, borderRadius: 6,
          background: targetCubeId ? '#1c1917' : '#1e293b',
          border: `1px solid ${targetCubeId ? '#d97706' : '#334155'}`,
        }}>
          {targetCubeId && targetCube ? (
            <div>
              <div style={{ color: '#d97706', fontSize: 10, fontWeight: 600, marginBottom: 2 }}>
                Target: {targetCube.variationId}
              </div>
              <div style={{ color: '#78716c', fontSize: 9 }}>
                pos ({targetCube.position.map(p => p.toFixed(0)).join(', ')})
              </div>
            </div>
          ) : (
            <div style={{ color: '#78716c', fontSize: 11 }}>
              Click a cube in the assembly to target it
            </div>
          )}
        </div>
      )}

      {/* Base variation selector — standalone mode only */}
      {!hasAssembly && (
        <div>
          <label style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 4 }}>
            Base Variation
          </label>
          <select
            value={baseVariationId}
            onChange={(e) => setBaseVariation(e.target.value)}
            style={{
              width: '100%', padding: 6, background: '#1e293b', border: '1px solid #334155',
              borderRadius: 4, color: 'white', fontSize: 11,
            }}
          >
            {CUBE_VARIATIONS.map(v => (
              <option key={v.id} value={v.id}>{v.id} — {v.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Browse from archthesis */}
      <button
        onClick={() => setShowBrowser(true)}
        style={{
          padding: 8, background: '#1e293b', border: '1px solid #334155',
          borderRadius: 6, color: '#94a3b8', cursor: 'pointer',
          fontSize: 11, fontWeight: 500, textAlign: 'left' as const,
        }}
      >
        Browse from archthesis...
      </button>

      <ArchthesisBrowser
        open={showBrowser}
        onClose={() => setShowBrowser(false)}
        onSelect={handleArchthesisSelect}
      />

      {/* Site context curator */}
      <button
        onClick={() => setShowSiteContext(true)}
        style={{
          padding: 8, background: activeSiteContext ? '#1e3a2f' : '#1e293b',
          border: `1px solid ${activeSiteContext ? '#22c55e' : '#334155'}`,
          borderRadius: 6, color: activeSiteContext ? '#22c55e' : '#94a3b8', cursor: 'pointer',
          fontSize: 11, fontWeight: 500, textAlign: 'left' as const,
        }}
      >
        {activeSiteContext
          ? `Site: ${activeSiteContext.site_name}`
          : 'Set site context...'}
      </button>

      <SiteContextCurator
        open={showSiteContext}
        onClose={() => setShowSiteContext(false)}
      />

      {/* Selected meme thumbnail */}
      {selectedMemeImageUrl && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: 6, background: '#1e293b', borderRadius: 6,
          border: '1px solid #334155',
        }}>
          <img
            src={selectedMemeImageUrl}
            alt={selectedMemeTitle || 'selected meme'}
            style={{
              width: 48, height: 48, borderRadius: 4,
              objectFit: 'contain', background: '#0f172a',
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              color: 'white', fontSize: 10, fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {selectedMemeTitle}
            </div>
            <div style={{ color: '#64748b', fontSize: 9 }}>from archthesis</div>
          </div>
          <button
            onClick={() => setSelectedMeme(null, null)}
            style={{
              background: 'none', border: 'none', color: '#64748b',
              cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Meme description */}
      <div>
        <label style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 4 }}>
          Describe the meme or paste its content
        </label>
        <textarea
          value={memeDescription}
          onChange={(e) => setMemeDescription(e.target.value)}
          placeholder="A viral meme about gentrification in south Tel Aviv..."
          rows={4}
          style={{
            width: '100%', padding: 8, background: '#1e293b', border: '1px solid #334155',
            borderRadius: 4, color: 'white', fontSize: 12, resize: 'vertical',
            fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Location tag */}
      <div>
        <label style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 4 }}>
          Location tag (optional)
        </label>
        <input
          type="text"
          value={locationTag}
          onChange={(e) => setLocationTag(e.target.value)}
          placeholder="e.g., Dizengoff Center, Tel Aviv"
          style={{
            width: '100%', padding: 6, background: '#1e293b', border: '1px solid #334155',
            borderRadius: 4, color: 'white', fontSize: 12, boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Engagement level */}
      <div>
        <label style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 4 }}>
          Engagement level: {engagementLevel}
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={engagementLevel}
          onChange={(e) => setEngagementLevel(Number(e.target.value))}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', fontSize: 9 }}>
          <span>Low</span>
          <span>High</span>
        </div>
      </div>

      {/* Pass mode: v1 single-pass vs v2 two-pass */}
      <div>
        <label style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 4 }}>
          Translation mode
        </label>
        <div style={{
          display: 'flex', borderRadius: 6, overflow: 'hidden',
          border: '1px solid #334155',
        }}>
          <button
            onClick={() => setPassMode('single')}
            disabled={isTranslating}
            style={{
              flex: 1, padding: '6px 8px',
              background: passMode === 'single' ? '#334155' : '#0f172a',
              border: 'none',
              color: passMode === 'single' ? 'white' : '#64748b',
              cursor: isTranslating ? 'not-allowed' : 'pointer',
              fontSize: 11, fontWeight: passMode === 'single' ? 600 : 400,
            }}
          >
            Single pass
          </button>
          <button
            onClick={() => setPassMode('two_pass')}
            disabled={isTranslating}
            style={{
              flex: 1, padding: '6px 8px',
              background: passMode === 'two_pass' ? '#334155' : '#0f172a',
              border: 'none',
              borderLeft: '1px solid #334155',
              color: passMode === 'two_pass' ? 'white' : '#64748b',
              cursor: isTranslating ? 'not-allowed' : 'pointer',
              fontSize: 11, fontWeight: passMode === 'two_pass' ? 600 : 400,
            }}
          >
            Two-pass (v2)
          </button>
        </div>
      </div>

      {/* Translate button */}
      <button
        onClick={translate}
        disabled={isTranslating || !memeDescription.trim() || (hasAssembly && !targetCubeId)}
        style={{
          padding: 10, background: isTranslating ? '#334155' : '#065f46', border: 'none',
          borderRadius: 6, color: 'white', cursor: isTranslating ? 'wait' : 'pointer',
          fontSize: 12, fontWeight: 600,
          opacity: ((!memeDescription.trim() || (hasAssembly && !targetCubeId)) && !isTranslating) ? 0.5 : 1,
        }}
      >
        {isTranslating ? 'Translating...' : hasAssembly && !targetCubeId ? 'Select a cube first' : 'Translate'}
      </button>

      {/* Error display */}
      {lastError && (
        <div style={{
          padding: 8, background: '#7f1d1d', borderRadius: 4,
          color: '#fca5a5', fontSize: 11, lineHeight: 1.4,
        }}>
          {lastError}
        </div>
      )}
    </div>
  );
};
