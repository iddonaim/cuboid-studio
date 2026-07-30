import React, { useState, useEffect } from 'react';
import { useMemeStore } from '../../store/useMemeStore';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useAppStore } from '../../store/useAppStore';
import { CUBE_VARIATIONS } from '../../lib/cube/specifications';
import { ArchthesisBrowser } from './ArchthesisBrowser';
import { TranslationLexiconEditor } from './TranslationLexiconEditor';
import { ModelComparisonPanel } from './ModelComparisonPanel';
import { isModelLabEnabled } from '../../lib/modelLab';
import { getActiveSiteContext, subscribeActiveSiteContext } from '../../lib/storage/siteContext';
import type { CuboidMemeInput, ArchthesisMeme } from '../../types/archthesis';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/section';
import { ActiveSiteChip } from '../layout/ActiveSiteChip';

/** What pass-1 reads when an external meme arrives with no caption: the image
 *  itself is the meme, so the model is pointed at it rather than at prose. */
const EXTERNAL_MEME_DESCRIPTION =
  'External meme supplied as an image only — read its text and visual content from the attached image.';

export const MemeInputPanel: React.FC = () => {
  const memeDescription = useMemeStore(s => s.memeDescription);
  const setMemeDescription = useMemeStore(s => s.setMemeDescription);
  const locationTag = useMemeStore(s => s.locationTag);
  const setLocationTag = useMemeStore(s => s.setLocationTag);
  const setEngagementLevel = useMemeStore(s => s.setEngagementLevel);
  const isTranslating = useMemeStore(s => s.isTranslating);
  const lastError = useMemeStore(s => s.lastError);
  const translate = useMemeStore(s => s.translate);
  const baseVariationId = useMemeStore(s => s.baseVariationId);
  const setBaseVariation = useMemeStore(s => s.setBaseVariation);
  const initWorkingCube = useMemeStore(s => s.initWorkingCube);
  const selectedMemeImageUrl = useMemeStore(s => s.selectedMemeImageUrl);
  const selectedMemeTitle = useMemeStore(s => s.selectedMemeTitle);
  const selectedMemeSource = useMemeStore(s => s.selectedMemeSource);
  const setSelectedMeme = useMemeStore(s => s.setSelectedMeme);
  const targetCubeId = useMemeStore(s => s.targetCubeId);
  const setActiveMode = useAppStore(s => s.setActiveMode);

  const placedCubes = useBuilderStore(s => s.placedCubes);
  const hasAssembly = placedCubes.length > 0;
  const targetCube = placedCubes.find(c => c.id === targetCubeId);

  const [showBrowser, setShowBrowser] = useState(false);
  // External meme entry (URL + optional caption), local until "Use".
  const [externalUrl, setExternalUrl] = useState('');
  const [externalCaption, setExternalCaption] = useState('');
  const [externalError, setExternalError] = useState<string | null>(null);
  // Mirror the active site context so the "no site" hint tracks the Map tab.
  const [activeSiteContext, setActiveSiteContextState] = useState(() => getActiveSiteContext());
  useEffect(() => {
    return subscribeActiveSiteContext(() => {
      setActiveSiteContextState(getActiveSiteContext());
    });
  }, []);

  const handleArchthesisSelect = (input: CuboidMemeInput, meme: ArchthesisMeme) => {
    setMemeDescription(input.memeDescription);
    setLocationTag(input.locationTag || '');
    // Engagement rides along invisibly: derived from the meme's likes, it
    // scales cut magnitude in the prompt but is no longer user-editable.
    setEngagementLevel(input.engagementLevel);
    setSelectedMeme(
      meme.imageUrl,
      meme.topText || meme.description?.slice(0, 50) || meme.id,
      'archthesis',
    );
  };

  // An external meme is an image URL: the API forwards it to the model as a
  // vision block, so the meme is read from the picture itself. The optional
  // caption becomes the description; without one, a stock line points the
  // model at the image. Only https URLs — the server rejects anything else.
  const handleUseExternalMeme = () => {
    const url = externalUrl.trim();
    if (!/^https:\/\/.+/i.test(url)) {
      setExternalError('Needs a public https:// image URL.');
      return;
    }
    setExternalError(null);
    const caption = externalCaption.trim();
    setMemeDescription(caption || EXTERNAL_MEME_DESCRIPTION);
    setLocationTag('');
    setEngagementLevel(50);
    setSelectedMeme(url, caption ? caption.slice(0, 50) : 'External meme', 'external');
    setExternalUrl('');
    setExternalCaption('');
  };

  // Clearing the selection empties the whole meme input — with no free-text
  // field left in the panel, a lingering invisible description would be sent
  // with nothing on screen to show it.
  const handleClearSelectedMeme = () => {
    setSelectedMeme(null, null);
    setMemeDescription('');
    setLocationTag('');
    setEngagementLevel(50);
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
              <div className="text-primary text-[11px] font-semibold mb-0.5">
                Target: {targetCube.variationId}
              </div>
              <div className="text-ink-500 text-[10px]">
                pos ({targetCube.position.map(p => p.toFixed(0)).join(', ')})
              </div>
            </div>
          ) : (
            <div className="text-ink-500 text-[12px]">
              Click a cube in the assembly to target it
            </div>
          )}
        </div>
      )}

      {/* The site the translation is anchored to. Set/changed in Map — the
          in-panel curator was retired with Map as the landing tab. */}
      <ActiveSiteChip />
      {!activeSiteContext && (
        <button
          onClick={() => setActiveMode('map')}
          className="mb-2 w-full text-left px-2.5 py-2 rounded-md bg-ink-100 border border-ink-200 text-ink-500 text-[11px] cursor-pointer hover:bg-ink-200"
        >
          No site attached — pick one in <span className="text-primary">Map</span> to
          ground the translation.
        </button>
      )}

      {/* Primary task: the meme */}
      <Section id="pata-meme" title="Meme" defaultOpen>
      <div className="flex flex-col gap-2.5">
      {/* Browse from archthesis */}
      <Button
        onClick={() => setShowBrowser(true)}
        className="w-full h-auto py-2 px-3 bg-ink-100 border border-ink-200 text-ink-600 hover:bg-ink-200 text-[12px] font-medium justify-start"
      >
        Browse from archthesis...
      </Button>

      {selectedMemeImageUrl ? (
        /* Selected meme — everything the translation reads comes from the
           meme itself (image, description, location, engagement), shown as
           one compact read-only card. */
        <div className="flex flex-col gap-1.5 p-2 bg-ink-100 border border-ink-200 rounded-md">
          <div className="flex items-center gap-2">
            <img
              src={selectedMemeImageUrl}
              alt={selectedMemeTitle || 'selected meme'}
              className="w-12 h-12 rounded object-contain bg-ink-50 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="text-ink-900 text-[11px] font-medium truncate">{selectedMemeTitle}</div>
              <div className="text-ink-500 text-[10px]">
                {selectedMemeSource === 'external' ? 'external image' : 'from archthesis'}
              </div>
              {locationTag && (
                <div className="text-ink-500 text-[10px] truncate">{locationTag}</div>
              )}
            </div>
            <button
              onClick={handleClearSelectedMeme}
              title="Clear the selected meme"
              className="text-ink-500 hover:text-ink-700 text-sm leading-none px-0.5 bg-transparent border-0 cursor-pointer self-start"
            >
              &times;
            </button>
          </div>
          {memeDescription && memeDescription !== EXTERNAL_MEME_DESCRIPTION && (
            <div className="text-ink-600 text-[11px] leading-relaxed line-clamp-3">
              {memeDescription}
            </div>
          )}
        </div>
      ) : (
        <div className="text-ink-400 text-[11px] leading-relaxed px-0.5">
          Pick a meme from archthesis, or attach one from elsewhere under
          External meme below.
        </div>
      )}
      </div>
      </Section>

      {/* Memes from outside archthesis, by image URL. The model reads the
          picture itself; the caption is optional framing. */}
      <Section id="pata-external" title="External meme">
        <div className="flex flex-col gap-2">
          <div>
            <label className="text-ink-600 text-[12px] block mb-1">Image URL</label>
            <input
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://…/meme.jpg"
              className="w-full px-2 py-1.5 bg-ink-100 border border-ink-200 rounded text-ink-900 text-[12px] box-border"
            />
          </div>
          <div>
            <label className="text-ink-600 text-[12px] block mb-1">Caption (optional)</label>
            <textarea
              value={externalCaption}
              onChange={(e) => setExternalCaption(e.target.value)}
              placeholder="Anything the image alone doesn't say"
              rows={2}
              className="w-full px-2 py-1.5 bg-ink-100 border border-ink-200 rounded text-ink-900 text-[12px] resize-y font-[inherit] box-border"
            />
          </div>
          {externalError && (
            <div className="text-destructive text-[11px]">{externalError}</div>
          )}
          <Button
            onClick={handleUseExternalMeme}
            disabled={!externalUrl.trim()}
            className="w-full h-auto py-2 text-[12px] bg-ink-100 border border-ink-200 text-ink-600 hover:bg-ink-200 disabled:opacity-50"
          >
            Use this meme
          </Button>
        </div>
      </Section>

      {/* The vocabulary the translation reasons with — first-class, not a
          buried setting, since two-pass is now the only shipping path. */}
      <Section id="pata-vocabulary" title="Translation vocabulary">
        <TranslationLexiconEditor />
      </Section>

      {/* Standalone mode only: which variation the cuts start from */}
      {!hasAssembly && (
        <Section id="pata-base" title="Base variation">
          <select
            value={baseVariationId}
            onChange={(e) => setBaseVariation(e.target.value)}
            className="w-full px-2 py-1.5 bg-ink-100 border border-ink-200 rounded text-ink-900 text-[12px]"
          >
            {CUBE_VARIATIONS.map(v => (
              <option key={v.id} value={v.id}>{v.id} — {v.name}</option>
            ))}
          </select>
        </Section>
      )}

      {/* Model lab — cross-model comparison, runs the v2 pipeline.
          Archived: hidden unless re-enabled (src/lib/modelLab.ts). */}
      {isModelLabEnabled() && <ModelComparisonPanel />}

      <div className="flex flex-col gap-2.5 pt-2.5 border-t border-ink-200">
      {/* Translate button */}
      <Button
        onClick={() => translate()}
        disabled={isTranslating || isDisabled}
        className={`w-full h-auto py-2.5 text-[13px] font-semibold border-0 ${
          isTranslating ? 'bg-ink-200 text-ink-600 cursor-wait' : 'bg-primary hover:bg-primary/85 text-white'
        } ${isDisabled && !isTranslating ? 'opacity-50' : ''}`}
      >
        {isTranslating
          ? 'Translating...'
          : !memeDescription.trim()
          ? 'Pick a meme first'
          : hasAssembly && !targetCubeId
          ? 'Select a cube first'
          : 'Translate'}
      </Button>

      {/* Error display */}
      {lastError && (
        <div className="p-2 bg-destructive/10 rounded text-destructive text-[12px] leading-relaxed">
          {lastError}
        </div>
      )}
      </div>

      {/* Modal — mounted at panel root so collapsing sections can't unmount
          it while open */}
      <ArchthesisBrowser
        open={showBrowser}
        onClose={() => setShowBrowser(false)}
        onSelect={handleArchthesisSelect}
      />
    </div>
  );
};
