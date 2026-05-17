import React from 'react';
import { useEncodingStore } from '../../store/useEncodingStore';

export const EncodingResultPanel: React.FC = () => {
  const encodingReasoning = useEncodingStore(s => s.encodingReasoning);
  const isEncoding = useEncodingStore(s => s.isEncoding);
  const seedCubes = useEncodingStore(s => s.seedCubes);
  const encodedCubes = useEncodingStore(s => s.encodedCubes);
  const mode = useEncodingStore(s => s.mode);

  if (!encodingReasoning && !isEncoding) return null;

  return (
    <div className="absolute top-4 right-4 bg-slate-950 border border-slate-700 rounded-lg p-4 w-[260px]">
      {isEncoding ? (
        <p className="text-slate-400 text-xs">Encoding space...</p>
      ) : (
        <>
          <p className="text-white text-sm mb-2">Space Encoded</p>
          <div className="p-2 bg-slate-800 rounded text-slate-300 text-[11px] leading-relaxed italic">
            {encodingReasoning}
            {mode !== 'standalone' && seedCubes.length > 0 && (
              <p className="text-slate-400 text-[11px] mt-1.5 mb-0">
                {seedCubes.length} preserved · {encodedCubes?.length ?? 0} added
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};
