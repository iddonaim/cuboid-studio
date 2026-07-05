import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import JSZip from 'jszip';
import { CUBE_SIZE } from '../../lib/cube/constants';
import { CUBE_VARIATIONS, CubeVariation } from '../../lib/cube/specifications';
import { getVariationGeometryAsync } from '../../lib/cube/csgUtils';

// Setup orthographic camera for true isometric view — do not modify (3D logic)
const IsometricCamera: React.FC = () => {
  const { camera } = useThree();

  useEffect(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      const distance = 100;
      camera.position.set(distance, distance * Math.SQRT2, distance);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  return null;
};

// Single cube renderer for thumbnail — do not modify (3D logic)
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

  useEffect(() => {
    if (geometry && edgesGeometry) {
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

// Capture helper — do not modify (3D/GL logic)
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
    setReadyToCapture(true);
  }, []);

  const handleCapture = useCallback((dataUrl: string) => {
    const variation = CUBE_VARIATIONS[currentIndex];
    setThumbnails(prev => [...prev, { id: variation.id, dataUrl }]);
    setReadyToCapture(false);
    setProgress(((currentIndex + 1) / CUBE_VARIATIONS.length) * 100);

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
    for (const { id, dataUrl } of thumbnails) {
      const base64Data = dataUrl.split(',')[1];
      zip.file(`${id}.png`, base64Data, { base64: true });
    }
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
    <div className="p-5 font-sans">
      <h1 className="text-2xl font-bold mb-2">Thumbnail Generator</h1>
      <p className="text-gray-500 mb-5">
        Generate PNG thumbnails for all {CUBE_VARIATIONS.length} cube variations.
        Save them to <code className="font-mono">/public/thumbnails/</code> folder.
      </p>

      <div className="mb-5">
        {!isGenerating ? (
          <button
            onClick={startGeneration}
            className="px-6 py-3 text-base bg-primary text-white border-0 rounded-lg cursor-pointer hover:bg-primary/85"
          >
            Generate All Thumbnails
          </button>
        ) : (
          <div>
            <p className="mb-2">
              Generating: {currentVariation?.id} ({currentIndex + 1}/{CUBE_VARIATIONS.length})
            </p>
            <div className="w-[300px] h-5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Hidden canvas for rendering — Canvas/R3F children untouched */}
      {isGenerating && currentVariation && (
        <div className="absolute -left-[9999px] w-32 h-32">
          <Canvas
            orthographic
            camera={{
              zoom: 1.4,
              position: [100, 100 * Math.SQRT2, 100],
              near: 0.1,
              far: 1000
            }}
            style={{ background: '#f7f5f0' }}
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
          <div className="flex items-center gap-4 mb-4">
            <h2 className="text-xl font-semibold">Generated Thumbnails ({thumbnails.length})</h2>
            <button
              onClick={downloadAll}
              className="px-4 py-2 bg-primary text-white border-0 rounded-md cursor-pointer hover:bg-primary/85"
            >
              Download All
            </button>
          </div>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(100px,1fr))]">
            {thumbnails.map(({ id, dataUrl }) => (
              <div
                key={id}
                onClick={() => downloadSingle(id, dataUrl)}
                className="cursor-pointer border border-gray-200 rounded-lg p-2 text-center hover:border-gray-400"
              >
                <img src={dataUrl} alt={id} className="w-20 h-20" />
                <p className="mt-1 mb-0 text-[12px]">{id}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ThumbnailGenerator;
