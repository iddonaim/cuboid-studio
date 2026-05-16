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
    <div style={{
      position: 'absolute',
      top: 16,
      right: 16,
      background: '#0f172a',
      border: '1px solid #334155',
      borderRadius: 8,
      padding: 16,
      width: 260,
    }}>
      {isEncoding ? (
        <p style={{ color: '#94a3b8', fontSize: 12 }}>Encoding space...</p>
      ) : (
        <>
          <p style={{ color: 'white', fontSize: 14, marginBottom: 8 }}>Space Encoded</p>
          <div style={{
            padding: 8, background: '#1e293b', borderRadius: 4,
            color: '#cbd5e1', fontSize: 11, lineHeight: 1.5,
            fontStyle: 'italic',
          }}>
            {encodingReasoning}
            {mode !== 'standalone' && seedCubes.length > 0 && (
              <p style={{ color: '#94a3b8', fontSize: 11, margin: '6px 0 0 0' }}>
                {seedCubes.length} preserved · {encodedCubes?.length ?? 0} added
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};
