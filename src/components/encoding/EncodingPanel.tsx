import React, { useRef } from 'react';
import { useEncodingStore, UploadedEncodingImage } from '../../store/useEncodingStore';
import { useAppStore } from '../../store/useAppStore';
import { useEvolutionStore } from '../../store/useEvolutionStore';
import { listSavedStates, SavedState } from '../../lib/savedStates';
import { Button } from '@/components/ui/button';
import { resizeImageToBase64 } from '../../lib/encoding/resizeImageToBase64';
import { EncodingReadingPanel } from './EncodingReadingPanel';
import { LexiconEditor } from './LexiconEditor';

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
  const readingEdited = useEncodingStore(s => s.readingEdited);
  const lastError = useEncodingStore(s => s.lastError);
  const encode = useEncodingStore(s => s.encode);
  const loadIntoBuilder = useEncodingStore(s => s.loadIntoBuilder);
  const mode = useEncodingStore(s => s.mode);
  const setMode = useEncodingStore(s => s.setMode);
  const setSeedFromBuilder = useEncodingStore(s => s.setSeedFromBuilder);
  const setSeedFromSavedState = useEncodingStore(s => s.setSeedFromSavedState);
  const seedCubes = useEncodingStore(s => s.seedCubes);
  const openSeedEdit = useEncodingStore(s => s.openSeedEdit);
  const setActiveMode = useAppStore(s => s.setActiveMode);
  const setEvolutionSubMode = useEvolutionStore(s => s.setSubMode);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [savedStates, setSavedStates] = React.useState<SavedState[]>([]);
  const [selectedSeedId, setSelectedSeedId] = React.useState<string | null>(null);
  const hasImages = multiPhotoEnabled
    ? uploadedImages.length > 0
    : Boolean(uploadedImage);

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

  const handleModeSelect = (newMode: 'standalone' | 'merge' | 'remix') => {
    setMode(newMode);
    setSelectedSeedId(null);
    if (newMode === 'merge') {
      setSeedFromBuilder();
    }
    if (newMode === 'remix') {
      setSavedStates(listSavedStates());
    }
  };

  const handleSeedSelect = (s: SavedState) => {
    setSelectedSeedId(s.id);
    setSeedFromSavedState(s);
  };

  const encodeDisabled =
    isEncoding ||
    imagesRestoredOnly ||
    (mode === 'merge' && seedCubes.length === 0) ||
    (mode === 'remix' && seedCubes.length === 0);

  const handleEncode = () => {
    if (mode === 'merge') {
      setSeedFromBuilder();
    }
    encode();
  };

  const MODE_LABELS: { value: 'standalone' | 'merge' | 'remix'; label: string }[] = [
    { value: 'standalone', label: 'Standalone' },
    { value: 'merge', label: 'Merge' },
    { value: 'remix', label: 'Remix' },
  ];

  return (
    <div className="flex flex-col gap-2.5">

      {/* Active lexicon selector + editor (L3 backstage — throwaway test surface) */}
      <LexiconEditor />

      {/* Multi-photo toggle */}
      <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-400">
        <input
          type="checkbox"
          checked={multiPhotoEnabled}
          onChange={(e) => setMultiPhotoEnabled(e.target.checked)}
          className="rounded border-slate-600"
        />
        Multi-photo
      </label>

      {/* Mode selector */}
      <div className="flex gap-1">
        {MODE_LABELS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => handleModeSelect(value)}
            className={`flex-1 py-1.5 px-1 rounded-md text-[10px] border cursor-pointer ${
              mode === value
                ? 'bg-blue-950 border-blue-500 text-blue-300 font-semibold'
                : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Merge seed slot — build or edit the seed inline */}
      {mode === 'merge' && (
        <div className="p-2 bg-slate-800 border border-slate-700 rounded flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[11px] ${seedCubes.length > 0 ? 'text-slate-400' : 'text-amber-400'}`}>
              {seedCubes.length > 0
                ? `Seed: ${seedCubes.length} cube${seedCubes.length !== 1 ? 's' : ''}`
                : 'Seed is empty'}
            </span>
            <Button
              onClick={() => { setSeedFromBuilder(); openSeedEdit(); }}
              className="h-auto py-1 px-2 text-[10px] bg-slate-700 hover:bg-slate-600 text-white border-0"
            >
              {seedCubes.length > 0 ? 'Edit seed' : 'Build seed'}
            </Button>
          </div>
        </div>
      )}

      {/* Remix seed picker */}
      {mode === 'remix' && !hasImages && (
        <div className="flex flex-col gap-1">
          <div className="text-slate-500 text-[10px]">Select a seed assembly:</div>
          {savedStates.length === 0 ? (
            <div className="p-2 bg-slate-800 border border-slate-700 rounded text-slate-500 text-[11px] italic">
              No saved states — save an assembly first.
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 max-h-[140px] overflow-y-auto">
              {savedStates.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleSeedSelect(s)}
                  className={`py-1.5 px-2 rounded border text-[10px] text-left flex justify-between items-center cursor-pointer ${
                    selectedSeedId === s.id
                      ? 'bg-blue-950 border-blue-500 text-blue-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-slate-600 text-[9px]">
                    {s.cubeCount}c · {new Date(s.savedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {imagesRestoredOnly && (
        <div className="p-2 bg-amber-950 border border-amber-800 rounded text-amber-300 text-[10px] leading-relaxed">
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
              className="py-6 border-2 border-dashed border-slate-700 rounded-lg cursor-pointer text-center bg-slate-800"
            >
              <div className="text-slate-400 text-xs mb-1">Upload photos (up to 7)</div>
              <div className="text-slate-600 text-[10px]">
                Mark one as primary — it anchors the assembly
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {uploadedImages.map((img) => (
                  <div
                    key={img.id}
                    className={`relative shrink-0 w-20 rounded-md border-2 overflow-hidden ${
                      img.id === primaryImageId
                        ? 'border-blue-500'
                        : 'border-slate-700'
                    }`}
                  >
                    <img
                      src={img.dataUrl}
                      alt=""
                      className="w-20 h-16 object-cover bg-slate-950"
                    />
                    <label className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-0.5 bg-slate-950/80 py-0.5 cursor-pointer">
                      <input
                        type="radio"
                        name="primary-encoding-image"
                        checked={img.id === primaryImageId}
                        onChange={() => setPrimaryImage(img.id)}
                        className="w-2.5 h-2.5"
                      />
                      <span className="text-[8px] text-slate-400">Primary</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => removeImage(img.id)}
                      className="absolute top-0.5 right-0.5 bg-slate-950/90 border-0 text-slate-400 rounded px-1 text-xs leading-none cursor-pointer"
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
                  className="py-1.5 bg-slate-800 border border-slate-700 rounded-md text-slate-500 cursor-pointer text-[10px]"
                >
                  Add more ({uploadedImages.length}/7)
                </button>
              )}
              <button
                type="button"
                onClick={clearAllImages}
                className="py-1 bg-transparent border-0 text-slate-600 cursor-pointer text-[10px] self-start"
              >
                Clear all
              </button>
            </div>
          )}
        </>
      ) : !uploadedImage ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="py-6 border-2 border-dashed border-slate-700 rounded-lg cursor-pointer text-center bg-slate-800"
        >
          <div className="text-slate-400 text-xs mb-1">Upload or capture a photo</div>
          <div className="text-slate-600 text-[10px]">
            A street corner, a shop, an office, a room...
          </div>
        </div>
      ) : (
        <div className="relative">
          <img
            src={uploadedImage}
            alt="Uploaded space"
            className="w-full rounded-md object-contain max-h-[160px] bg-slate-950"
          />
          <button
            onClick={clearImage}
            className="absolute top-1 right-1 bg-slate-950 border-0 text-slate-400 rounded px-1.5 py-px text-sm leading-none cursor-pointer"
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
            className="flex-1 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-400 cursor-pointer text-[10px]"
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
            className="flex-1 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-400 cursor-pointer text-[10px]"
          >
            Camera
          </button>
        </div>
      )}

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
          className={`w-full h-auto py-2.5 text-xs font-semibold border-0 ${
            encodeDisabled
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : isEncoding
              ? 'bg-slate-700 text-white cursor-wait'
              : 'bg-blue-950 text-white hover:bg-blue-900'
          }`}
        >
          {isEncoding ? 'Encoding space...' : 'Encode'}
        </Button>
      )}

      {/* Error display */}
      {lastError && (
        <div className="p-2 bg-red-900 rounded text-red-300 text-[11px] leading-relaxed">
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
              <span className="text-[10px] text-sky-300/90 bg-slate-900/90 border border-slate-600 rounded px-2 py-0.5">
                Updating…
              </span>
            </div>
          )}
          {encodingReading && (
            <EncodingReadingPanel
              reading={encodingReading}
              readingEdited={readingEdited}
              lexicon={encodingLexicon}
            />
          )}

          <div className="text-slate-400 text-[11px]">
            {encodedCubes.length} cubes encoded
            {' '}({new Set(encodedCubes.map(c => c.variationId)).size} unique variations)
          </div>

          <div className="max-h-[100px] overflow-y-auto flex flex-wrap gap-1">
            {encodedCubes.map((cube, i) => (
              <span key={i} className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-400 text-[9px]">
                {cube.variationId}
              </span>
            ))}
          </div>

          <Button
            onClick={() => handleLoadAndSwitch('edit')}
            className="w-full h-auto py-2.5 text-xs font-semibold bg-emerald-900 hover:bg-emerald-800 text-white border-0"
          >
            Load &amp; edit
          </Button>
          <Button
            onClick={() => handleLoadAndSwitch('memes')}
            className="w-full h-auto py-2.5 text-xs font-semibold bg-orange-950 hover:bg-orange-900 text-white border-0"
          >
            Load &amp; apply memes
          </Button>

          <button
            type="button"
            onClick={handleEncode}
            disabled={isEncoding || imagesRestoredOnly}
            title={imagesRestoredOnly ? 'Re-upload the photo(s) first' : undefined}
            className="py-1.5 bg-transparent border border-slate-700 rounded-md text-slate-500 cursor-pointer text-[10px] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isEncoding ? 'Re-encoding…' : 'Re-encode'}
          </button>
        </div>
      )}
    </div>
  );
};
