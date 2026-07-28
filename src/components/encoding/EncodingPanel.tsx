import React, { useRef } from 'react';
import { useEncodingStore, UploadedEncodingImage } from '../../store/useEncodingStore';
import { useAppStore } from '../../store/useAppStore';
import { useEvolutionStore } from '../../store/useEvolutionStore';
import { useLexiconStore } from '../../store/useLexiconStore';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useMemeStore } from '../../store/useMemeStore';
import { useDecodeStore } from '../../store/useDecodeStore';
import { DEFAULT_LEXICON } from '../../prompts/lexicon.default';
import { saveState } from '../../lib/savedStates';
import { Button } from '@/components/ui/button';
import { resizeImageToBase64 } from '../../lib/encoding/resizeImageToBase64';
import { EncodingReadingPanel } from './EncodingReadingPanel';
import { remixDecisions } from '../../lib/encoding/remixDecisions';
import { EncodeModelComparisonPanel } from './EncodeModelComparisonPanel';
import { isModelLabEnabled } from '../../lib/modelLab';
import { Section } from '@/components/ui/section';
import { ActiveSiteChip } from '../layout/ActiveSiteChip';
import { LexiconEditor } from './LexiconEditor';
import { ConnectionViolationNotice } from '../viewport/ConnectionViolationNotice';
import { toCheckableCubes } from '../../lib/cube/connectionViolations';

async function readImageFile(file: File): Promise<UploadedEncodingImage | null> {
  try {
    const { base64, mediaType, thumbnailDataUrl } = await resizeImageToBase64(file);
    const dataUrl = `data:${mediaType};base64,${base64}`;
    return {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      dataUrl,
      base64,
      mediaType,
      thumbnailDataUrl,
    };
  } catch {
    return null;
  }
}

export const EncodingPanel: React.FC = () => {
  const uploadedImage = useEncodingStore(s => s.uploadedImage);
  const setImage = useEncodingStore(s => s.setImage);
  const clearImage = useEncodingStore(s => s.clearImage);
  const multiPhotoEnabled = useEncodingStore(s => s.multiPhotoEnabled);
  const setMultiPhotoEnabled = useEncodingStore(s => s.setMultiPhotoEnabled);
  const uploadedImages = useEncodingStore(s => s.uploadedImages);
  const primaryImageId = useEncodingStore(s => s.primaryImageId);
  const addImages = useEncodingStore(s => s.addImages);
  const removeImage = useEncodingStore(s => s.removeImage);
  const setPrimaryImage = useEncodingStore(s => s.setPrimaryImage);
  const clearAllImages = useEncodingStore(s => s.clearAllImages);
  const imagesRestoredOnly = useEncodingStore(s => s.imagesRestoredOnly);
  const isEncoding = useEncodingStore(s => s.isEncoding);
  const encodedCubes = useEncodingStore(s => s.encodedCubes);
  const encodingReading = useEncodingStore(s => s.encodingReading);
  const encodingLexicon = useEncodingStore(s => s.encodingLexicon);
  const encodingLexiconId = useEncodingStore(s => s.encodingLexiconId);
  const readingEdited = useEncodingStore(s => s.readingEdited);
  const lastError = useEncodingStore(s => s.lastError);
  const encode = useEncodingStore(s => s.encode);
  const loadIntoBuilder = useEncodingStore(s => s.loadIntoBuilder);
  const mode = useEncodingStore(s => s.mode);
  const setMode = useEncodingStore(s => s.setMode);
  const setSeedFromBuilder = useEncodingStore(s => s.setSeedFromBuilder);
  const seedCubes = useEncodingStore(s => s.seedCubes);
  const seedCubeIds = useEncodingStore(s => s.seedCubeIds);
  const remixResultReplacesSeed = useEncodingStore(s => s.remixResultReplacesSeed);
  const showAdditions = useEncodingStore(s => s.showAdditions);
  const setShowAdditions = useEncodingStore(s => s.setShowAdditions);
  const openSeedEdit = useEncodingStore(s => s.openSeedEdit);
  const resultApplied = useEncodingStore(s => s.resultApplied);
  const previousResult = useEncodingStore(s => s.previousResult);
  const showPreviousProposal = useEncodingStore(s => s.showPreviousProposal);
  const setShowPreviousProposal = useEncodingStore(s => s.setShowPreviousProposal);
  const restorePreviousResult = useEncodingStore(s => s.restorePreviousResult);
  const showDiscarded = useEncodingStore(s => s.showDiscarded);
  const setShowDiscarded = useEncodingStore(s => s.setShowDiscarded);
  const discardPreviousResult = useEncodingStore(s => s.discardPreviousResult);
  const setActiveMode = useAppStore(s => s.setActiveMode);
  const setEvolutionSubMode = useEvolutionStore(s => s.setSubMode);
  const placedCubes = useBuilderStore(s => s.placedCubes);

  // Item 3: the reading shown below was produced with the lexicon captured at
  // encode time. If the active vocabulary has changed since (switched or
  // edited in place), nothing re-reads automatically — surface that and offer
  // the re-read explicitly.
  const activeLexiconId = useLexiconStore(s => s.activeLexiconId);
  const lexicons = useLexiconStore(s => s.lexicons);
  const activeLexiconValue = React.useMemo(() => {
    if (activeLexiconId === null) return DEFAULT_LEXICON;
    return lexicons.find(l => l.id === activeLexiconId)?.lexicon ?? DEFAULT_LEXICON;
  }, [activeLexiconId, lexicons]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasImages = multiPhotoEnabled
    ? uploadedImages.length > 0
    : Boolean(uploadedImage);

  // In standalone mode, once the encoded result has been loaded into the
  // builder and edited (Done), `seedCubes` holds the edited assembly. Cubes
  // whose grid position isn't in the original encoded set were added by hand.
  const encodedPositionKeys = React.useMemo(
    () => new Set((encodedCubes ?? []).map(c => c.position.join(','))),
    [encodedCubes]
  );
  const addedCount =
    mode === 'standalone'
      ? seedCubes.filter(c => !encodedPositionKeys.has(c.position.join(','))).length
      : 0;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (multiPhotoEnabled) {
      const remaining = 7 - uploadedImages.length;
      const toRead = Array.from(files).slice(0, remaining);
      const parsed = (await Promise.all(toRead.map(readImageFile))).filter(
        (img): img is UploadedEncodingImage => img !== null
      );
      if (parsed.length > 0) addImages(parsed);
    } else {
      const img = await readImageFile(files[0]);
      if (img) setImage(img.dataUrl, img.base64, img.mediaType, img.thumbnailDataUrl);
    }
    e.target.value = '';
  };

  // Post-encode destinations.
  //
  // The old IA had two "Load into ..." buttons that jumped to the top-level
  // Builder or Pataphysical modes. Those modes no longer exist as primary
  // nav, so we redirect:
  //   - 'edit'   : load the encoded result into the assembly and open the
  //                seed-edit view inside Encode (formerly the Builder tab).
  //   - 'memes'  : load the result, then jump to Evolution → Pataphysical
  //                sub-mode (formerly the Pataphysical tab).
  const handleLoadAndSwitch = (target: 'edit' | 'memes') => {
    loadIntoBuilder();
    if (target === 'edit') {
      openSeedEdit();
    } else {
      setEvolutionSubMode('pataphysical');
      setActiveMode('evolution');
    }
  };

  // Merge and remix both act on the assembly that's on screen — they differ in
  // what they do to it, not in what they read.
  const handleModeSelect = (newMode: 'standalone' | 'merge' | 'remix') => {
    setMode(newMode);
    if (newMode !== 'standalone') {
      setSeedFromBuilder();
    }
  };

  const encodeDisabled =
    isEncoding ||
    imagesRestoredOnly ||
    (mode === 'merge' && seedCubes.length === 0) ||
    (mode === 'remix' && seedCubes.length === 0);

  // The current result was read under a different vocabulary than the one now
  // active. Compare values, not just ids — an in-place edit keeps the id.
  const lexiconChangedSinceEncode =
    !!encodedCubes &&
    !!encodingLexicon &&
    !isEncoding &&
    JSON.stringify(activeLexiconValue) !== JSON.stringify(encodingLexicon);

  // "Applied" is only true while the result is still *in* the assembly.
  // Loading a saved state (or editing the assembly away from it) takes it back
  // out, and the panel has to offer Apply again rather than keep claiming the
  // encoding is live.
  const placedCubeIds = React.useMemo(
    () => new Set(placedCubes.map(c => c.id)),
    [placedCubes]
  );
  const resultInAssembly = React.useMemo(() => {
    if (!encodedCubes || encodedCubes.length === 0) return false;
    return encodedCubes.every(c => !!c.id && placedCubeIds.has(c.id));
  }, [encodedCubes, placedCubeIds]);
  // What the model decided per seed cube. Only meaningful for a remix result
  // that stands in for the seed; the counts and the viewport read the same
  // numbers from here.
  const cubeOperators = useMemeStore(s => s.cubeOperators);
  const decisions = React.useMemo(() => {
    if (mode !== 'remix' || !remixResultReplacesSeed || !encodedCubes) return null;
    return remixDecisions(encodedCubes, seedCubes, cubeOperators);
  }, [mode, remixResultReplacesSeed, encodedCubes, seedCubes, cubeOperators]);

  const appliedAndLive = resultApplied && resultInAssembly;
  const appliedThenReplaced = resultApplied && !resultInAssembly;

  // Applying replaces the whole assembly in standalone (a fresh reading) and
  // in remix (the reinterpretation stands in for what it was made from).
  // Merge is the only additive one.
  const applyReplacesAssembly =
    mode !== 'merge' && placedCubes.length > 0 && !resultInAssembly;

  const handleEncode = () => {
    if (mode !== 'standalone') {
      setSeedFromBuilder();
    }
    encode();
  };

  // Re-encoding throws away the current reading and proposal. Never run it
  // straight off a click when there's something to lose — confirm first, and
  // say exactly what goes.
  const [reencodeConfirm, setReencodeConfirm] = React.useState<
    null | 'plain' | 'vocabulary'
  >(null);
  const [savedBeforeReencode, setSavedBeforeReencode] = React.useState<string | null>(null);
  const [compareReadings, setCompareReadings] = React.useState(false);

  const requestReencode = (reason: 'plain' | 'vocabulary') => {
    if (!encodedCubes || encodedCubes.length === 0) {
      handleEncode();
      return;
    }
    setSavedBeforeReencode(null);
    setReencodeConfirm(reason);
  };

  const confirmReencode = () => {
    setReencodeConfirm(null);
    setSavedBeforeReencode(null);
    handleEncode();
  };

  /** Snapshot the current assembly into Saved States before a destructive step. */
  const handleSaveAssembly = () => {
    if (placedCubes.length === 0) return;
    const decode = useDecodeStore.getState();
    const cubeOperators = useMemeStore.getState().cubeOperators;
    const saved = saveState('', placedCubes, cubeOperators, {
      canvasTiles: decode.canvasTiles,
      freestyle: decode.freestyle,
    });
    setSavedBeforeReencode(saved.name);
  };

  const MODE_LABELS: {
    value: 'standalone' | 'merge' | 'remix';
    label: string;
    hint: string;
  }[] = [
    { value: 'standalone', label: 'Standalone', hint: 'Read the photo on its own — a new assembly, ignoring what you have.' },
    { value: 'merge', label: 'Merge', hint: 'Compose alongside what you have — the result is added to it.' },
    { value: 'remix', label: 'Remix', hint: 'Reinterpret what you have — the photo rewrites it, and the result replaces it.' },
  ];

  return (
    <div className="flex flex-col">
      <ActiveSiteChip />

      {/* Primary task: photograph an inhabited space */}
      <Section id="encode-photograph" title="Photograph" defaultOpen>
      <div className="flex flex-col gap-2.5">

      {/* Multi-photo toggle */}
      <label className="flex items-center gap-2 cursor-pointer text-[12px] text-ink-600">
        <input
          type="checkbox"
          checked={multiPhotoEnabled}
          onChange={(e) => setMultiPhotoEnabled(e.target.checked)}
          className="rounded border-ink-300"
        />
        Multi-photo
      </label>

      {/* Mode selector */}
      <div className="flex gap-1">
        {MODE_LABELS.map(({ value, label, hint }) => (
          <button
            key={value}
            title={hint}
            onClick={() => handleModeSelect(value)}
            className={`flex-1 py-1.5 px-1 rounded-md text-[11px] border cursor-pointer ${
              mode === value
                ? 'bg-primary/10 border-primary text-primary font-semibold'
                : 'bg-ink-100 border-ink-200 text-ink-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* What merge and remix act on: the assembly that's on screen. Both read
          it the same way — they differ in what they do to it. */}
      {mode !== 'standalone' && (
        <div className="p-2 bg-ink-100 border border-ink-200 rounded flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[12px] ${seedCubes.length > 0 ? 'text-ink-600' : 'text-amber-600'}`}>
              {seedCubes.length > 0
                ? `Your assembly: ${seedCubes.length} cube${seedCubes.length !== 1 ? 's' : ''}`
                : 'Your assembly is empty'}
            </span>
            <Button
              onClick={() => { setSeedFromBuilder(); openSeedEdit(); }}
              className="h-auto py-1 px-2 text-[11px] bg-ink-200 hover:bg-ink-300 text-ink-900 border-0"
            >
              {seedCubes.length > 0 ? 'Edit' : 'Build'}
            </Button>
          </div>
          <div className="text-ink-500 text-[11px] leading-relaxed">
            {mode === 'merge'
              ? 'The photo composes with what you have — the result is cubes added around it.'
              : seedCubes.length > 0
              ? 'The photo acts on what you have — the result is this assembly rewritten: cubes kept, transformed, transplanted, discarded, added. Load a saved assembly first to remix that one instead.'
              : 'Remix rewrites an assembly through a photo. Build one, or load a saved assembly, first.'}
          </div>
        </div>
      )}

      {imagesRestoredOnly && (
        <div className="p-2 bg-amber-50 border border-amber-300 rounded text-amber-700 text-[11px] leading-relaxed">
          Loaded from a saved composition — these are small preview thumbnails only.
          Re-upload the photo(s) to encode or re-encode.
        </div>
      )}

      {/* Image upload area */}
      {multiPhotoEnabled ? (
        <>
          {uploadedImages.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="py-6 border-2 border-dashed border-ink-200 rounded-lg cursor-pointer text-center bg-ink-100"
            >
              <div className="text-ink-600 text-[13px] mb-1">Upload photos (up to 7)</div>
              <div className="text-ink-400 text-[11px]">
                Mark one as primary — it anchors the assembly
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {uploadedImages.map((img) => (
                  <div
                    key={img.id}
                    className={`relative shrink-0 w-28 rounded-md border-2 overflow-hidden ${
                      img.id === primaryImageId
                        ? 'border-primary'
                        : 'border-ink-200'
                    }`}
                  >
                    <img
                      src={img.dataUrl}
                      alt=""
                      className="w-28 h-20 object-cover bg-ink-100"
                    />
                    <label className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-0.5 bg-ink-100/80 py-0.5 cursor-pointer">
                      <input
                        type="radio"
                        name="primary-encoding-image"
                        checked={img.id === primaryImageId}
                        onChange={() => setPrimaryImage(img.id)}
                        className="w-2.5 h-2.5"
                      />
                      <span className="text-[9px] text-ink-600">Primary</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => removeImage(img.id)}
                      className="absolute top-0.5 right-0.5 bg-ink-100/90 border-0 text-ink-600 rounded px-1 text-[13px] leading-none cursor-pointer"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
              {uploadedImages.length < 7 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="py-1.5 bg-ink-100 border border-ink-200 rounded-md text-ink-500 cursor-pointer text-[11px]"
                >
                  Add more ({uploadedImages.length}/7)
                </button>
              )}
              <button
                type="button"
                onClick={clearAllImages}
                className="py-1 bg-transparent border-0 text-ink-400 cursor-pointer text-[11px] self-start"
              >
                Clear all
              </button>
            </div>
          )}
        </>
      ) : !uploadedImage ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="py-6 border-2 border-dashed border-ink-200 rounded-lg cursor-pointer text-center bg-ink-100"
        >
          <div className="text-ink-600 text-[13px] mb-1">Upload or capture a photo</div>
          <div className="text-ink-400 text-[11px]">
            A street corner, a shop, an office, a room...
          </div>
        </div>
      ) : (
        <div className="relative">
          <img
            src={uploadedImage}
            alt="Uploaded space"
            className="w-full rounded-md object-contain max-h-[260px] bg-ink-100"
          />
          <button
            onClick={clearImage}
            className="absolute top-1 right-1 bg-ink-100 border-0 text-ink-600 rounded px-1.5 py-px text-sm leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {/* Hidden file input — accept image/* with camera capture */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={multiPhotoEnabled}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Separate buttons for gallery and camera on mobile */}
      {!hasImages && (
        <div className="flex gap-1.5">
          <button
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.removeAttribute('capture');
                fileInputRef.current.click();
              }
            }}
            className="flex-1 py-2 bg-ink-100 border border-ink-200 rounded-md text-ink-600 cursor-pointer text-[11px]"
          >
            Gallery
          </button>
          <button
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.setAttribute('capture', 'environment');
                fileInputRef.current.click();
              }
            }}
            className="flex-1 py-2 bg-ink-100 border border-ink-200 rounded-md text-ink-600 cursor-pointer text-[11px]"
          >
            Camera
          </button>
        </div>
      )}
      </div>
      </Section>

      {/* Active lexicon selector + editor (L3) — collapsed; edits change how
          every encode reads a space, so it's deliberately out of the everyday
          path. */}
      <Section id="encode-vocabulary" title="Vocabulary">
        <LexiconEditor />
      </Section>

      {/* Model lab — cross-model comparison on the same photo(s). Only useful
          once there's an image to run. Archived: hidden unless re-enabled
          (src/lib/modelLab.ts). */}
      {hasImages && isModelLabEnabled() && <EncodeModelComparisonPanel />}

      <div className="flex flex-col gap-2.5 pt-2.5 border-t border-ink-200">
      {/* Encode button */}
      {hasImages && !encodedCubes && (
        <Button
          onClick={handleEncode}
          disabled={encodeDisabled}
          title={
            mode === 'merge' && seedCubes.length === 0
              ? 'Add cubes to the Builder first'
              : mode === 'remix' && seedCubes.length === 0
              ? 'Select a seed assembly above'
              : undefined
          }
          className={`w-full h-auto py-2.5 text-[13px] font-semibold border-0 ${
            encodeDisabled
              ? 'bg-ink-200 text-ink-500 cursor-not-allowed'
              : isEncoding
              ? 'bg-ink-200 text-ink-600 cursor-wait'
              : 'bg-primary text-white hover:bg-primary/85'
          }`}
        >
          {isEncoding ? 'Encoding space...' : 'Encode'}
        </Button>
      )}

      {/* Error display */}
      {lastError && (
        <div className="p-2 bg-destructive/10 rounded text-destructive text-[12px] leading-relaxed">
          {lastError}
        </div>
      )}

      {/* Result — reading in sidebar; reasoning stays on the floating canvas card */}
      {encodedCubes && (
        <div
          className={`flex flex-col gap-2 relative ${isEncoding ? 'opacity-60 pointer-events-none' : ''}`}
        >
          {isEncoding && (
            <div className="absolute inset-0 z-10 flex items-start justify-center pt-1 pointer-events-none">
              <span className="text-[11px] text-primary bg-ink-50/90 border border-ink-300 rounded px-2 py-0.5">
                Updating…
              </span>
            </div>
          )}
          {encodingReading && (
            <EncodingReadingPanel
              reading={encodingReading}
              readingEdited={readingEdited}
              lexicon={encodingLexicon}
              lexiconName={
                encodingLexiconId === null
                  ? 'Default'
                  : lexicons.find(l => l.id === encodingLexiconId)?.name ?? 'Custom'
              }
            />
          )}

          {/* A re-encode replaced an earlier result — make the swap visible and
              reversible instead of letting it happen silently. */}
          {previousResult && (
            <div className="p-2 bg-ink-100 border border-ink-300 rounded flex flex-col gap-1.5">
              <div className="text-ink-600 text-[11px] leading-relaxed">
                This replaced an earlier reading
                {previousResult.readingEdited ? ' (including your revisions to it)' : ''} and its{' '}
                {previousResult.cubes.length}-cube proposal.
                {previousResult.wasApplied
                  ? ' That one had been applied — your assembly still holds it until you apply this one.'
                  : ''}
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-[11px] text-ink-600">
                <input
                  type="checkbox"
                  checked={showPreviousProposal}
                  onChange={e => setShowPreviousProposal(e.target.checked)}
                  className="rounded border-ink-300"
                />
                Ghost the old proposal in the viewport
              </label>
              <button
                type="button"
                onClick={() => setCompareReadings(v => !v)}
                className="self-start bg-transparent border-0 p-0 text-primary text-[11px] cursor-pointer underline"
              >
                {compareReadings ? 'Hide the previous reading' : 'Compare with the previous reading'}
              </button>
              <div className="flex gap-1.5">
                <Button
                  onClick={restorePreviousResult}
                  title="Bring the previous reading and proposal back (nothing is written to the assembly until you apply)"
                  className="flex-1 h-auto py-1.5 text-[11px] bg-ink-200 hover:bg-ink-300 text-ink-900 border-0"
                >
                  Restore previous
                </Button>
                <Button
                  onClick={discardPreviousResult}
                  className="flex-1 h-auto py-1.5 text-[11px] bg-transparent hover:bg-ink-200 text-ink-500 border border-ink-200"
                >
                  Keep this one
                </Button>
              </div>
            </div>
          )}

          {previousResult && compareReadings && previousResult.reading && (
            <div className="flex flex-col gap-1">
              <div className="font-mono text-[9px] uppercase tracking-wider text-ink-400">
                Previous reading
              </div>
              <div className="opacity-80">
                <EncodingReadingPanel
                  reading={previousResult.reading}
                  readingEdited={previousResult.readingEdited}
                  lexicon={previousResult.lexicon}
                  lexiconName={
                    previousResult.lexiconId === null
                      ? 'Default'
                      : lexicons.find(l => l.id === previousResult.lexiconId)?.name ?? 'Custom'
                  }
                />
              </div>
            </div>
          )}

          {/* Result stats — same at-a-glance strip style as Evolution's header */}
          <div className="flex gap-1.5">
            <div className="flex-1 bg-ink-100 border border-ink-200 rounded px-2 py-1.5 text-center">
              <div className="text-ink-800 text-[15px] font-semibold leading-none">
                {encodedCubes.length}
              </div>
              <div className="text-ink-500 text-[9px] font-mono uppercase tracking-wide mt-1">
                cubes
              </div>
            </div>
            <div className="flex-1 bg-ink-100 border border-ink-200 rounded px-2 py-1.5 text-center">
              <div className="text-ink-800 text-[15px] font-semibold leading-none">
                {new Set(encodedCubes.map(c => c.variationId)).size}
              </div>
              <div className="text-ink-500 text-[9px] font-mono uppercase tracking-wide mt-1">
                variations
              </div>
            </div>
            <div className="flex-1 bg-ink-100 border border-ink-200 rounded px-2 py-1.5 text-center">
              <div className="text-ink-800 text-[15px] font-semibold leading-none">
                {new Set(encodedCubes.map(c => c.position[1])).size}
              </div>
              <div className="text-ink-500 text-[9px] font-mono uppercase tracking-wide mt-1">
                levels
              </div>
            </div>
          </div>

          {/* Refused adjacencies in the proposal. The grammar teaches the model
              the connection law; this catches the times it doesn't follow it.
              Nothing is repaired — the proposal arrives exactly as returned. */}
          <ConnectionViolationNotice
            cubes={toCheckableCubes(encodedCubes)}
            subject="this proposal"
          />

          {/* Remix v2 result — say what loading will do (replace, not add). */}
          {mode === 'remix' && remixResultReplacesSeed && decisions && (
            <div className="p-2 bg-ink-100 border border-ink-200 rounded flex flex-col gap-1.5">
              <div className="font-mono text-[9px] uppercase tracking-wider text-ink-400">
                What the photo did to your assembly
              </div>
              <ul className="text-ink-600 text-[11px] leading-relaxed m-0 pl-0 list-none flex flex-col gap-0.5">
                <li>{decisions.carried.length} carried forward, cuts intact</li>
                {decisions.transplanted.length > 0 && (
                  <li>{decisions.transplanted.length} transplanted — new body, cuts kept</li>
                )}
                <li>{decisions.added.length} new or transformed</li>
                <li className={decisions.discarded.length > 0 ? 'text-amber-700' : undefined}>
                  {decisions.discarded.length} discarded
                  {decisions.discardedOperatorCount > 0
                    ? `, taking ${decisions.discardedOperatorCount} cut${
                        decisions.discardedOperatorCount !== 1 ? 's' : ''
                      } with them`
                    : ''}
                </li>
              </ul>
              {decisions.discarded.length > 0 && (
                <label className="flex items-center gap-2 cursor-pointer text-[11px] text-ink-600">
                  <input
                    type="checkbox"
                    checked={showDiscarded}
                    onChange={e => setShowDiscarded(e.target.checked)}
                    className="rounded border-ink-300"
                  />
                  Show the discarded cubes in the viewport
                </label>
              )}
              {decisions.discardedOperatorCount > 0 && (
                <div className="text-amber-700 text-[11px] leading-relaxed">
                  Discarded cuts can't be regenerated — save this assembly first
                  if you want to keep them.
                </div>
              )}
            </div>
          )}

          {/* Before / after toggle — appears once the assembly has been edited
              in the builder and there are hand-added cubes to show or hide. */}
          {addedCount > 0 && (
            <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-400">
              <input
                type="checkbox"
                checked={showAdditions}
                onChange={(e) => setShowAdditions(e.target.checked)}
                className="rounded border-slate-600"
              />
              Show added cubes ({addedCount})
            </label>
          )}

          <div className="max-h-[100px] overflow-y-auto flex flex-wrap gap-1">
            {encodedCubes.map((cube, i) => (
              <span key={i} className="px-1.5 py-0.5 bg-ink-200 rounded text-ink-600 text-[10px]">
                {cube.variationId}
              </span>
            ))}
          </div>

          {/* Vocabulary drift notice — the reading above used the lexicon
              captured at encode time; changing the active lexicon does NOT
              re-read automatically. */}
          {lexiconChangedSinceEncode && !reencodeConfirm && (
            <div className="p-2 bg-amber-50 border border-amber-300 rounded flex flex-col gap-1.5">
              <div className="text-amber-700 text-[11px] leading-relaxed">
                The vocabulary changed since this reading. Re-reading generates a
                new reading and a new proposed assembly — it replaces this
                result, it doesn't add to it.
              </div>
              <Button
                onClick={() => requestReencode('vocabulary')}
                disabled={encodeDisabled}
                title={imagesRestoredOnly ? 'Re-upload the photo(s) first' : undefined}
                className="w-full h-auto py-2 text-[12px] font-semibold bg-amber-600 hover:bg-amber-600/85 text-white border-0"
              >
                {isEncoding ? 'Re-reading…' : 'Re-read with new vocabulary'}
              </Button>
            </div>
          )}

          {/* Re-encode confirmation — spells out what a re-read destroys, and
              offers a one-click save of the assembly before it runs. */}
          {reencodeConfirm && (
            <div className="p-2 bg-amber-50 border border-amber-300 rounded flex flex-col gap-2">
              <div className="text-amber-800 text-[12px] font-semibold leading-snug">
                {reencodeConfirm === 'vocabulary'
                  ? 'Re-read with the new vocabulary?'
                  : 'Re-encode this space?'}
              </div>
              <ul className="text-amber-700 text-[11px] leading-relaxed list-disc pl-4 m-0 flex flex-col gap-1">
                <li>
                  The reading above and this {encodedCubes.length}-cube proposal are
                  replaced by new ones.
                  {readingEdited && ' Your revisions to the reading go with them.'}
                </li>
                <li>
                  Your assembly ({placedCubes.length} cube{placedCubes.length !== 1 ? 's' : ''})
                  is not touched by the re-read
                  {applyReplacesAssembly
                    ? ' — but applying the new result afterwards replaces it.'
                    : '.'}
                </li>
                <li>
                  Afterwards you can compare the two readings, ghost the old
                  proposal over the new one, and restore this one.
                </li>
              </ul>
              {placedCubes.length > 0 && (
                savedBeforeReencode ? (
                  <div className="text-green-700 text-[11px]">
                    Assembly saved as “{savedBeforeReencode}”.
                  </div>
                ) : (
                  <Button
                    onClick={handleSaveAssembly}
                    className="w-full h-auto py-1.5 text-[11px] bg-ink-100 hover:bg-ink-200 text-ink-700 border border-ink-300"
                  >
                    Save the assembly to Saved States first
                  </Button>
                )
              )}
              <div className="flex gap-1.5">
                <Button
                  onClick={confirmReencode}
                  disabled={encodeDisabled}
                  className="flex-1 h-auto py-2 text-[12px] font-semibold bg-amber-600 hover:bg-amber-600/85 text-white border-0"
                >
                  {reencodeConfirm === 'vocabulary' ? 'Re-read' : 'Re-encode'}
                </Button>
                <Button
                  onClick={() => { setReencodeConfirm(null); setSavedBeforeReencode(null); }}
                  className="flex-1 h-auto py-2 text-[12px] bg-transparent hover:bg-ink-200 text-ink-600 border border-ink-300"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Step 1: accept the encoding into the assembly. Editing and memes
              are follow-ups, offered once the result is applied. */}
          {!appliedAndLive ? (
            <>
              {/* What the canvas is showing right now. Two layers on screen
                  with no label was the whole confusion: people read the solid
                  proposal as their assembly and the ghosted assembly as junk. */}
              {placedCubes.length > 0 && (
                <div className="text-ink-500 text-[11px] leading-relaxed bg-ink-100 border border-ink-200 rounded px-2 py-1.5">
                  {appliedThenReplaced
                    ? `Your assembly changed since you applied this encoding. On the canvas the solid ${placedCubes.length}-cube assembly is what you have; this ${encodedCubes.length}-cube encoding is ghosted over it so you can compare. Apply it again to put it back.`
                    : `On the canvas: this ${encodedCubes.length}-cube proposal is solid; your current ${placedCubes.length}-cube assembly is ghosted behind it. Nothing is written until you apply.`}
                </div>
              )}
              <Button
                onClick={loadIntoBuilder}
                className="w-full h-auto py-2.5 text-[13px] font-semibold bg-primary hover:bg-primary/85 text-white border-0"
              >
                {appliedThenReplaced ? 'Apply encoding again' : 'Apply encoding'}
              </Button>
              <div className="text-ink-400 text-[11px] text-center leading-snug">
                {applyReplacesAssembly
                  ? `Replaces your current ${placedCubes.length}-cube assembly with this result.`
                  : mode === 'merge'
                  ? 'Adds this result to the assembly — you can edit it or apply memes right after.'
                  : 'Accepts this result into the assembly — you can edit it or apply memes right after.'}
              </div>
              {applyReplacesAssembly && (
                savedBeforeReencode ? (
                  <div className="text-green-700 text-[11px] text-center">
                    Assembly saved as “{savedBeforeReencode}”.
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleSaveAssembly}
                    className="bg-transparent border-0 p-0 text-primary text-[11px] cursor-pointer underline self-center"
                  >
                    Save the current assembly first
                  </button>
                )
              )}
            </>
          ) : (
            <>
              <div className="text-[11px] text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1.5">
                Applied to the assembly. Continue when ready:
              </div>
              <div className="flex gap-1.5">
                <Button
                  onClick={() => handleLoadAndSwitch('edit')}
                  className="flex-1 h-auto py-2.5 text-[13px] font-semibold bg-primary/10 hover:bg-primary/20 text-primary border-0"
                >
                  Edit assembly
                </Button>
                <Button
                  onClick={() => handleLoadAndSwitch('memes')}
                  className="flex-1 h-auto py-2.5 text-[13px] font-semibold bg-primary/10 hover:bg-primary/20 text-primary border-0"
                >
                  Apply memes
                </Button>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => requestReencode('plain')}
            disabled={encodeDisabled}
            title={
              imagesRestoredOnly
                ? 'Re-upload the photo(s) first'
                : mode === 'merge' && seedCubes.length === 0
                ? 'Add cubes to the Builder first'
                : mode === 'remix' && seedCubes.length === 0
                ? 'Select a seed assembly above'
                : 'Replaces this reading and proposal with a fresh one'
            }
            className="py-1.5 bg-transparent border border-ink-200 rounded-md text-ink-500 cursor-pointer text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isEncoding ? 'Re-encoding…' : 'Re-encode (replaces this result)'}
          </button>
        </div>
      )}
      </div>
    </div>
  );
};
