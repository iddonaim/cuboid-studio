import React, { useRef } from 'react';
import { useEncodingStore } from '../../store/useEncodingStore';
import { useAppStore } from '../../store/useAppStore';
import { useEvolutionStore } from '../../store/useEvolutionStore';
import { listSavedStates, SavedState } from '../../lib/savedStates';
import { Button } from '@/components/ui/button';

export const EncodingPanel: React.FC = () => {
  const uploadedImage = useEncodingStore(s => s.uploadedImage);
  const setImage = useEncodingStore(s => s.setImage);
  const clearImage = useEncodingStore(s => s.clearImage);
  const isEncoding = useEncodingStore(s => s.isEncoding);
  const encodedCubes = useEncodingStore(s => s.encodedCubes);
  const encodingReasoning = useEncodingStore(s => s.encodingReasoning);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
      if (match) {
        setImage(dataUrl, match[2], match[1]);
      }
    };
    reader.readAsDataURL(file);
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
      {mode === 'remix' && !uploadedImage && (
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

      {/* Image upload area */}
      {!uploadedImage ? (
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
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Separate buttons for gallery and camera on mobile */}
      {!uploadedImage && (
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
      {uploadedImage && !encodedCubes && (
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

      {/* Result */}
      {encodedCubes && (
        <div className="flex flex-col gap-2">
          {encodingReasoning && (
            <div className="p-2 bg-slate-800 border border-slate-700 rounded text-slate-300 text-[11px] leading-relaxed italic">
              {encodingReasoning}
            </div>
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
            onClick={() => {
              useEncodingStore.setState({ encodedCubes: null, encodingReasoning: null });
            }}
            className="py-1.5 bg-transparent border border-slate-700 rounded-md text-slate-500 cursor-pointer text-[10px]"
          >
            Re-encode
          </button>
        </div>
      )}
    </div>
  );
};
