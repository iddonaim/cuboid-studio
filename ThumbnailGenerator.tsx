import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import JSZip from 'jszip';
import { CUBE_SIZE } from './constants';
import { CUBE_VARIATIONS, CubeVariation } from './CUTTER_SPECIFICATIONS';
import { getVariationGeometryAsync } from './csgUtils';

// Setup orthographic camera for true isometric view
const IsometricCamera: React.FC = () => {
  const { camera } = useThree();

  useEffect(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      // Classic isometric angle: 35.264° from horizontal (arctan(1/√2))
      // Camera position at equal X, Z with Y = X * √2
      const distance = 100;
      camera.position.set(distance, distance * Math.SQRT2, distance);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  return null;
};

// Single cube renderer for thumbnail
const ThumbnailCube: React.FC<{
  variation: CubeVariation;
  onReady: () => void;
}> = ({ variation, onReady }) => {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [edgesGeometry, setEdgesGeometry] = useState<THREE.EdgesGeometry | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadGeometry = async () => {
      try {
        const geo = await getVariationGeometryAsync(variation);
        if (!cancelled) {
          setGeometry(geo);
          setEdgesGeometry(new THREE.EdgesGeometry(geo, 15));
        }
      } catch (error) {
        console.error(`Failed to load geometry for ${variation.id}:`, error);
        if (!cancelled) {
          const fallback = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
          setGeometry(fallback);
          setEdgesGeometry(new THREE.EdgesGeometry(fallback, 15));
        }
      }
    };

    loadGeometry();

    return () => { cancelled = true; };
  }, [variation]);

  // Notify when geometry is ready
  useEffect(() => {
    if (geometry && edgesGeometry) {
      // Small delay to ensure rendering is complete
      const timer = setTimeout(onReady, 100);
      return () => clearTimeout(timer);
    }
  }, [geometry, edgesGeometry, onReady]);

  const geometryOffset: [number, number, number] = [
    -CUBE_SIZE / 2,
    -CUBE_SIZE / 2,
    -CUBE_SIZE / 2
  ];

  if (!geometry || !edgesGeometry) return null;

  return (
    <group>
      <mesh geometry={geometry} position={geometryOffset}>
        <meshBasicMaterial color="#ffffff" side={THREE.FrontSide} />
      </mesh>
      <lineSegments geometry={edgesGeometry} position={geometryOffset}>
        <lineBasicMaterial color="#000000" linewidth={2} />
      </lineSegments>
    </group>
  );
};

// Capture helper
const CaptureHelper: React.FC<{
  onCapture: (dataUrl: string) => void;
  shouldCapture: boolean;
}> = ({ onCapture, shouldCapture }) => {
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

const ThumbnailGenerator: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [readyToCapture, setReadyToCapture] = useState(false);
  const [thumbnails, setThumbnails] = useState<{ id: string; dataUrl: string }[]>([]);
  const [progress, setProgress] = useState(0);

  const handleCubeReady = useCallback(() => {
    // Cube geometry loaded, ready to capture
    setReadyToCapture(true);
  }, []);

  const handleCapture = useCallback((dataUrl: string) => {
    const variation = CUBE_VARIATIONS[currentIndex];
    setThumbnails(prev => [...prev, { id: variation.id, dataUrl }]);
    setReadyToCapture(false);
    setProgress(((currentIndex + 1) / CUBE_VARIATIONS.length) * 100);

    // Move to next variation
    if (currentIndex < CUBE_VARIATIONS.length - 1) {
      setTimeout(() => setCurrentIndex(prev => prev + 1), 50);
    } else {
      setIsGenerating(false);
    }
  }, [currentIndex]);

  const startGeneration = () => {
    setThumbnails([]);
    setCurrentIndex(0);
    setProgress(0);
    setIsGenerating(true);
    setReadyToCapture(false);
  };

  const downloadAll = async () => {
    const zip = new JSZip();

    // Add each thumbnail to the zip
    for (const { id, dataUrl } of thumbnails) {
      // Convert data URL to blob
      const base64Data = dataUrl.split(',')[1];
      zip.file(`${id}.png`, base64Data, { base64: true });
    }

    // Generate and download zip
    const blob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.download = 'thumbnails.zip';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadSingle = (id: string, dataUrl: string) => {
    const link = document.createElement('a');
    link.download = `${id}.png`;
    link.href = dataUrl;
    link.click();
  };

  const currentVariation = CUBE_VARIATIONS[currentIndex];

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Thumbnail Generator</h1>
      <p style={{ color: '#666', marginBottom: 20 }}>
        Generate PNG thumbnails for all {CUBE_VARIATIONS.length} cube variations.
        Save them to <code>/public/thumbnails/</code> folder.
      </p>

      <div style={{ marginBottom: 20 }}>
        {!isGenerating ? (
          <button
            onClick={startGeneration}
            style={{
              padding: '12px 24px',
              fontSize: 16,
              background: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer'
            }}
          >
            Generate All Thumbnails
          </button>
        ) : (
          <div>
            <p>Generating: {currentVariation?.id} ({currentIndex + 1}/{CUBE_VARIATIONS.length})</p>
            <div style={{
              width: 300,
              height: 20,
              background: '#e5e7eb',
              borderRadius: 10,
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${progress}%`,
                height: '100%',
                background: '#4f46e5',
                transition: 'width 0.2s'
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Hidden canvas for rendering */}
      {isGenerating && currentVariation && (
        <div style={{ width: 128, height: 128, position: 'absolute', left: -9999 }}>
          <Canvas
            orthographic
            camera={{
              zoom: 1.4,
              position: [100, 100 * Math.SQRT2, 100],
              near: 0.1,
              far: 1000
            }}
            style={{ background: '#f1f5f9' }}
            gl={{ preserveDrawingBuffer: true }}
          >
            <IsometricCamera />
            <ambientLight intensity={1} />
            <ThumbnailCube
              key={currentVariation.id}
              variation={currentVariation}
              onReady={handleCubeReady}
            />
            <CaptureHelper
              onCapture={handleCapture}
              shouldCapture={readyToCapture}
            />
          </Canvas>
        </div>
      )}

      {/* Generated thumbnails */}
      {thumbnails.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <h2>Generated Thumbnails ({thumbnails.length})</h2>
            <button
              onClick={downloadAll}
              style={{
                padding: '8px 16px',
                background: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer'
              }}
            >
              Download All
            </button>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
            gap: 12
          }}>
            {thumbnails.map(({ id, dataUrl }) => (
              <div
                key={id}
                onClick={() => downloadSingle(id, dataUrl)}
                style={{
                  cursor: 'pointer',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: 8,
                  textAlign: 'center'
                }}
              >
                <img src={dataUrl} alt={id} style={{ width: 80, height: 80 }} />
                <p style={{ margin: '4px 0 0', fontSize: 11 }}>{id}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ThumbnailGenerator;
