import React, { useState, useEffect } from 'react';
import { useMemeStore } from '../../store/useMemeStore';
import { CUBE_VARIATIONS } from '../../lib/cube/specifications';
import { ArchthesisBrowser } from './ArchthesisBrowser';
import type { CuboidMemeInput } from '../../types/archthesis';

export const MemeInputPanel: React.FC = () => {
  const memeDescription = useMemeStore(s => s.memeDescription);
  const setMemeDescription = useMemeStore(s => s.setMemeDescription);
  const locationTag = useMemeStore(s => s.locationTag);
  const setLocationTag = useMemeStore(s => s.setLocationTag);
  const engagementLevel = useMemeStore(s => s.engagementLevel);
  const setEngagementLevel = useMemeStore(s => s.setEngagementLevel);
  const isTranslating = useMemeStore(s => s.isTranslating);
  const lastError = useMemeStore(s => s.lastError);
  const translate = useMemeStore(s => s.translate);
  const baseVariationId = useMemeStore(s => s.baseVariationId);
  const setBaseVariation = useMemeStore(s => s.setBaseVariation);
  const initWorkingCube = useMemeStore(s => s.initWorkingCube);

  const [showBrowser, setShowBrowser] = useState(false);

  const handleArchthesisSelect = (input: CuboidMemeInput) => {
    setMemeDescription(input.memeDescription);
    setLocationTag(input.locationTag || '');
    setEngagementLevel(input.engagementLevel);
  };

  // Init working cube on mount
  useEffect(() => {
    initWorkingCube();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Base variation selector */}
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

      {/* Translate button */}
      <button
        onClick={translate}
        disabled={isTranslating || !memeDescription.trim()}
        style={{
          padding: 10, background: isTranslating ? '#334155' : '#065f46', border: 'none',
          borderRadius: 6, color: 'white', cursor: isTranslating ? 'wait' : 'pointer',
          fontSize: 12, fontWeight: 600,
          opacity: (!memeDescription.trim() && !isTranslating) ? 0.5 : 1,
        }}
      >
        {isTranslating ? 'Translating...' : 'Translate'}
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
