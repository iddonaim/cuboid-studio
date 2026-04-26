import React, { useState, useEffect, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import JSZip from 'jszip';
import { CUBE_SIZE } from '../../lib/cube/constants';
import { CUBE_VARIATIONS, CubeVariation } from '../../lib/cube/specifications';
import { getVariationGeometryAsync } from '../../lib/cube/csgUtils';

// Four top-down 45° axonometric corner views.
// Geographic convention: -Z = North, +Z = South, +X = East, -X = West.
// Tilt angle is the classic isometric 35.264° (arctan(1/√2)) from horizontal.
type AxonAngle = 'top-ne' | 'top-nw' | 'top-se' | 'top-sw';

const ANGLES: { key: AxonAngle; pos: [number, number, number] }[] = [
  { key: 'top-ne', pos: [+1, +Math.SQRT2, -1] },
  { key: 'top-nw', pos: [-1, +Math.SQRT2, -1] },
  { key: 'top-se', pos: [+1, +Math.SQRT2, +1] },
  { key: 'top-sw', pos: [-1, +Math.SQRT2, +1] },
];

const RENDER_SIZE = 512;
const CAMERA_DISTANCE = 100;
const CAMERA_ZOOM = 5.4;

const AxonCamera: React.FC<{ pos: [number, number, number] }> = ({ pos }) => {
  const { camera } = useThree();
  useEffect(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      camera.position.set(
        pos[0] * CAMERA_DISTANCE,
        pos[1] * CAMERA_DISTANCE,
        pos[2] * CAMERA_DISTANCE
      );
      camera.lookAt(0, 0, 0);
      camera.zoom = CAMERA_ZOOM;
      camera.updateProjectionMatrix();
    }
  }, [camera, pos]);
  return null;
};

const WireframeCube: React.FC<{
  variation: CubeVariation;
  onReady: () => void;
}> = ({ variation, onReady }) => {
  const [edges, setEdges] = useState<THREE.EdgesGeometry | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const geo = await getVariationGeometryAsync(variation);
        if (!cancelled) setEdges(new THREE.EdgesGeometry(geo, 15));
      } catch (err) {
        console.error(`Failed to load geometry for ${variation.id}:`, err);
        if (!cancelled) {
          const fallback = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
          setEdges(new THREE.EdgesGeometry(fallback, 15));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [variation]);

  useEffect(() => {
    if (edges) {
      const t = setTimeout(onReady, 80);
      return () => clearTimeout(t);
    }
  }, [edges, onReady]);

  if (!edges) return null;

  const offset: [number, number, number] = [
    -CUBE_SIZE / 2,
    -CUBE_SIZE / 2,
    -CUBE_SIZE / 2,
  ];

  return (
    <lineSegments geometry={edges} position={offset}>
      <lineBasicMaterial color="#000000" linewidth={2} />
    </lineSegments>
  );
};

const CaptureHelper: React.FC<{
  shouldCapture: boolean;
  onCapture: (dataUrl: string) => void;
}> = ({ shouldCapture, onCapture }) => {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    if (shouldCapture) {
      gl.render(scene, camera);
      const dataUrl = gl.domElement.toDataURL('image/png');
      onCapture(dataUrl);
    }
  }, [shouldCapture, gl, scene, camera, onCapture]);
  return null;
};

type Output = { id: string; angle: AxonAngle; dataUrl: string };

const AxonometricGenerator: React.FC = () => {
  const [variationIndex, setVariationIndex] = useState(0);
  const [angleIndex, setAngleIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [readyToCapture, setReadyToCapture] = useState(false);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [progress, setProgress] = useState(0);

  const totalRenders = CUBE_VARIATIONS.length * ANGLES.length;
  const currentVariation = CUBE_VARIATIONS[variationIndex];
  const currentAngle = ANGLES[angleIndex];

  const handleReady = useCallback(() => setReadyToCapture(true), []);

  const handleCapture = useCallback(
    (dataUrl: string) => {
      const variation = CUBE_VARIATIONS[variationIndex];
      const angle = ANGLES[angleIndex];
      setOutputs((prev) => [...prev, { id: variation.id, angle: angle.key, dataUrl }]);
      setReadyToCapture(false);

      const nextDone = variationIndex * ANGLES.length + angleIndex + 1;
      setProgress((nextDone / totalRenders) * 100);

      if (angleIndex < ANGLES.length - 1) {
        setTimeout(() => setAngleIndex((i) => i + 1), 30);
      } else if (variationIndex < CUBE_VARIATIONS.length - 1) {
        setTimeout(() => {
          setAngleIndex(0);
          setVariationIndex((i) => i + 1);
        }, 30);
      } else {
        setIsGenerating(false);
      }
    },
    [variationIndex, angleIndex, totalRenders]
  );

  const start = () => {
    setOutputs([]);
    setVariationIndex(0);
    setAngleIndex(0);
    setProgress(0);
    setReadyToCapture(false);
    setIsGenerating(true);
  };

  const downloadAll = async () => {
    const zip = new JSZip();
    for (const { id, angle, dataUrl } of outputs) {
      const base64 = dataUrl.split(',')[1];
      zip.file(`${id}-${angle}.png`, base64, { base64: true });
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.download = 'axon-views.zip';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadSingle = (filename: string, dataUrl: string) => {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
  };

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Axonometric Wireframe Generator</h1>
      <p style={{ color: '#666', marginBottom: 20 }}>
        Generates four 45° top-angled axonometric wireframe PNGs (top-ne, top-nw, top-se,
        top-sw) for each of the {CUBE_VARIATIONS.length} cube variations. Lines only,
        transparent background. Output filename: <code>v-XX-top-ne.png</code> etc. Drop the
        unzipped contents into <code>public/axon-views/</code>.
      </p>

      <div style={{ marginBottom: 20 }}>
        {!isGenerating ? (
          <button
            onClick={start}
            style={{
              padding: '12px 24px',
              fontSize: 16,
              background: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Generate {totalRenders} Axonometric Views
          </button>
        ) : (
          <div>
            <p>
              Rendering: {currentVariation?.id} / {currentAngle?.key} (
              {variationIndex * ANGLES.length + angleIndex + 1}/{totalRenders})
            </p>
            <div
              style={{
                width: 300,
                height: 20,
                background: '#e5e7eb',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: '#4f46e5',
                  transition: 'width 0.2s',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {isGenerating && currentVariation && currentAngle && (
        <div
          style={{
            width: RENDER_SIZE,
            height: RENDER_SIZE,
            position: 'absolute',
            left: -9999,
          }}
        >
          <Canvas
            orthographic
            camera={{
              zoom: CAMERA_ZOOM,
              position: [
                currentAngle.pos[0] * CAMERA_DISTANCE,
                currentAngle.pos[1] * CAMERA_DISTANCE,
                currentAngle.pos[2] * CAMERA_DISTANCE,
              ],
              near: 0.1,
              far: 1000,
            }}
            style={{ background: 'transparent' }}
            gl={{ alpha: true, preserveDrawingBuffer: true, antialias: true }}
          >
            <AxonCamera pos={currentAngle.pos} />
            <WireframeCube
              key={`${currentVariation.id}-${currentAngle.key}`}
              variation={currentVariation}
              onReady={handleReady}
            />
            <CaptureHelper shouldCapture={readyToCapture} onCapture={handleCapture} />
          </Canvas>
        </div>
      )}

      {outputs.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <h2>Generated Views ({outputs.length})</h2>
            <button
              onClick={downloadAll}
              style={{
                padding: '8px 16px',
                background: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Download All (zip)
            </button>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: 12,
            }}
          >
            {outputs.map(({ id, angle, dataUrl }) => {
              const filename = `${id}-${angle}.png`;
              return (
                <div
                  key={filename}
                  onClick={() => downloadSingle(filename, dataUrl)}
                  style={{
                    cursor: 'pointer',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: 8,
                    textAlign: 'center',
                    background:
                      'repeating-conic-gradient(#e5e7eb 0% 25%, #f9fafb 0% 50%) 50% / 16px 16px',
                  }}
                >
                  <img src={dataUrl} alt={filename} style={{ width: 96, height: 96 }} />
                  <p style={{ margin: '4px 0 0', fontSize: 11 }}>{filename}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AxonometricGenerator;
