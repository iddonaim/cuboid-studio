import React, { useState, useEffect } from 'react';
import { useMemeStore } from '../../store/useMemeStore';
import { useBuilderStore } from '../../store/useBuilderStore';
import { CUBE_VARIATIONS } from '../../lib/cube/specifications';
import { ArchthesisBrowser } from './ArchthesisBrowser';
import { SiteContextCurator } from './SiteContextCurator';
import { TranslationLexiconEditor } from './TranslationLexiconEditor';
import { getActiveSiteContext, subscribeActiveSiteContext } from '../../lib/storage/siteContext';
import type { CuboidMemeInput, ArchthesisMeme } from '../../types/archthesis';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Section } from '@/components/ui/section';

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
  // Mirror active site context in state so saving/clearing inside the curator
  // updates this panel on close. Reading localStorage directly on every render
  // looks cheap but never reflects writes from the modal.
  const [activeSiteContext, setActiveSiteContextState] = useState(() => getActiveSiteContext());

  // Stay in sync with site context set elsewhere — notably the Map tab, which
  // writes the active context without ever touching this panel's modal. Without
  // this, the button label could show a stale site until the curator is reopened.
  useEffect(() => {
    return subscribeActiveSiteContext(() => {
      setActiveSiteContextState(getActiveSiteContext());
    });
  }, []);

  const handleCloseSiteContext = () => {
    setShowSiteContext(false);
    setActiveSiteContextState(getActiveSiteContext());
  };

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

  const isDisabled = !memeDescription.trim() || (hasAssembly && !targetCubeId);

  return (
    <div className="flex flex-col">
      {/* Assembly mode: target cube indicator */}
      {hasAssembly && (
        <div className={`p-2 mb-2.5 rounded-md border ${
          targetCubeId ? 'bg-primary/10 border-primary' : 'bg-ink-100 border-ink-200'
        }`}>
          {targetCubeId && targetCube ? (
            <div>
              <div className="text-primary text-[10px] font-semibold mb-0.5">
                Target: {targetCube.variationId}
              </div>
              <div className="text-ink-500 text-[9px]">
                pos ({targetCube.position.map(p => p.toFixed(0)).join(', ')})
              </div>
            </div>
          ) : (
            <div className="text-ink-500 text-[11px]">
              Click a cube in the assembly to target it
            </div>
          )}
        </div>
      )}

      {/* Primary task: the meme */}
      <Section id="pata-meme" title="Meme" defaultOpen>
      <div className="flex flex-col gap-2.5">
      {/* Browse from archthesis */}
      <Button
        onClick={() => setShowBrowser(true)}
        className="w-full h-auto py-2 px-3 bg-ink-100 border border-ink-200 text-ink-600 hover:bg-ink-200 text-[11px] font-medium justify-start"
      >
        Browse from archthesis...
      </Button>

      {/* Site context curator */}
      <Button
        onClick={() => setShowSiteContext(true)}
        className={`w-full h-auto py-2 px-3 text-[11px] font-medium justify-start border ${
          activeSiteContext
            ? 'bg-green-50 border-green-600/40 text-green-700 hover:bg-green-100'
            : 'bg-ink-100 border-ink-200 text-ink-600 hover:bg-ink-200'
        }`}
      >
        {activeSiteContext ? `Site: ${activeSiteContext.site_name}` : 'Set site context...'}
      </Button>

      {/* Selected meme thumbnail */}
      {selectedMemeImageUrl && (
        <div className="flex items-center gap-2 p-1.5 bg-ink-100 border border-ink-200 rounded-md">
          <img
            src={selectedMemeImageUrl}
            alt={selectedMemeTitle || 'selected meme'}
            className="w-12 h-12 rounded object-contain bg-ink-50 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="text-ink-900 text-[10px] font-medium truncate">{selectedMemeTitle}</div>
            <div className="text-ink-500 text-[9px]">from archthesis</div>
          </div>
          <button
            onClick={() => setSelectedMeme(null, null)}
            className="text-ink-500 hover:text-ink-700 text-sm leading-none px-0.5 bg-transparent border-0 cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {/* Meme description */}
      <div>
        <label className="text-ink-600 text-[11px] block mb-1">
          Describe the meme or paste its content
        </label>
        <textarea
          value={memeDescription}
          onChange={(e) => setMemeDescription(e.target.value)}
          placeholder="A viral meme about gentrification in south Tel Aviv..."
          rows={4}
          className="w-full px-2 py-2 bg-ink-100 border border-ink-200 rounded text-ink-900 text-xs resize-y font-[inherit] box-border"
        />
      </div>

      {/* Location tag */}
      <div>
        <label className="text-ink-600 text-[11px] block mb-1">Location tag (optional)</label>
        <input
          type="text"
          value={locationTag}
          onChange={(e) => setLocationTag(e.target.value)}
          placeholder="e.g., Dizengoff Center, Tel Aviv"
          className="w-full px-2 py-1.5 bg-ink-100 border border-ink-200 rounded text-ink-900 text-xs box-border"
        />
      </div>

      {/* Engagement level */}
      <div>
        <label className="text-ink-600 text-[11px] block mb-1">
          Engagement level: {engagementLevel}
        </label>
        <Slider
          min={0}
          max={100}
          value={[engagementLevel]}
          onValueChange={([v]) => setEngagementLevel(v)}
        />
        <div className="flex justify-between text-ink-400 text-[9px] mt-0.5">
          <span>Low</span>
          <span>High</span>
        </div>
      </div>
      </div>
      </Section>

      {/* Secondary: how the translation runs — collapsed by default */}
      <Section id="pata-settings" title="Translation settings">
      <div className="flex flex-col gap-2.5">
      {!hasAssembly && (
        <div>
          <label className="text-ink-600 text-[11px] block mb-1">Base Variation</label>
          <select
            value={baseVariationId}
            onChange={(e) => setBaseVariation(e.target.value)}
            className="w-full px-2 py-1.5 bg-ink-100 border border-ink-200 rounded text-ink-900 text-[11px]"
          >
            {CUBE_VARIATIONS.map(v => (
              <option key={v.id} value={v.id}>{v.id} — {v.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Pass mode: v1 single-pass vs v2 two-pass */}
      <div>
        <label className="text-ink-600 text-[11px] block mb-1">Translation mode</label>
        <div className="flex border border-ink-200 rounded-md overflow-hidden">
          <button
            onClick={() => setPassMode('single')}
            disabled={isTranslating}
            className={`flex-1 py-1.5 px-2 text-[11px] border-0 disabled:cursor-not-allowed ${
              passMode === 'single' ? 'bg-ink-300 text-ink-900 font-semibold' : 'bg-ink-50 text-ink-500'
            }`}
          >
            Single pass
          </button>
          <button
            onClick={() => setPassMode('two_pass')}
            disabled={isTranslating}
            className={`flex-1 py-1.5 px-2 text-[11px] border-0 border-l border-ink-200 disabled:cursor-not-allowed ${
              passMode === 'two_pass' ? 'bg-ink-300 text-ink-900 font-semibold' : 'bg-ink-50 text-ink-500'
            }`}
          >
            Two-pass (v2)
          </button>
        </div>
      </div>

      {/* Editable translation vocabulary — only affects two-pass translation */}
      {passMode === 'two_pass' && <TranslationLexiconEditor />}
      </div>
      </Section>

      <div className="flex flex-col gap-2.5 pt-2.5 border-t border-ink-200">
      {/* Translate button */}
      <Button
        onClick={translate}
        disabled={isTranslating || isDisabled}
        className={`w-full h-auto py-2.5 text-xs font-semibold border-0 ${
          isTranslating ? 'bg-ink-200 text-ink-600 cursor-wait' : 'bg-primary hover:bg-primary/85 text-white'
        } ${isDisabled && !isTranslating ? 'opacity-50' : ''}`}
      >
        {isTranslating ? 'Translating...' : hasAssembly && !targetCubeId ? 'Select a cube first' : 'Translate'}
      </Button>

      {/* Error display */}
      {lastError && (
        <div className="p-2 bg-destructive/10 rounded text-destructive text-[11px] leading-relaxed">
          {lastError}
        </div>
      )}
      </div>

      {/* Modals — mounted at panel root so collapsing sections can't unmount
          them while open */}
      <ArchthesisBrowser
        open={showBrowser}
        onClose={() => setShowBrowser(false)}
        onSelect={handleArchthesisSelect}
      />
      <SiteContextCurator open={showSiteContext} onClose={handleCloseSiteContext} />
    </div>
  );
};
