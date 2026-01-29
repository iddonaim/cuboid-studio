import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CUBE_SIZE, GRID_STRIDE } from './constants';
import { CUBE_VARIATIONS, CubeVariation } from './CUTTER_SPECIFICATIONS';
import { generateVariationGeometry, preGenerateAllGeometries, getVariationGeometryAsync, USE_PRECOMPUTED_MODELS } from './csgUtils';
import {
  Rotation,
  AxisRotation,
  Face,
  OPPOSITE_FACE,
  findValidRotation,
  findAllValidRotations,
  findValidRotationsAtPosition,
  getAdjacentFace,
  VARIATION_FACE_TYPES,
  getRotatedFaceCutType,
  DEFAULT_ROTATION,
  rotationsEqual,
  findRotationIndex,
  getAllRotations,
  PlacedCubeInfo
} from './connectionRules';

// 3D Spatial Grid - shows the lattice structure at cube edges (not through cubes)
const SpatialGrid: React.FC<{ size?: number; levels?: number }> = ({ size = 5, levels = 3 }) => {
  const gridLines = useMemo(() => {
    const positions: number[] = [];
    const halfSize = Math.floor(size / 2);

    // Grid lines are at cube EDGES, not centers
    // Horizontal planes at Y = 0, GRID_STRIDE, 2*GRID_STRIDE, etc. (between cube layers)
    for (let y = 0; y <= levels; y++) {
      const yPos = y * GRID_STRIDE;  // At the boundary between layers

      // X-axis lines (running along X) - at cube edges
      for (let z = -halfSize; z <= halfSize; z++) {
        const zEdge = z * GRID_STRIDE - CUBE_SIZE / 2;  // Edge position
        positions.push(-halfSize * GRID_STRIDE - CUBE_SIZE / 2, yPos, zEdge);
        positions.push(halfSize * GRID_STRIDE + CUBE_SIZE / 2, yPos, zEdge);
      }

      // Z-axis lines (running along Z) - at cube edges
      for (let x = -halfSize; x <= halfSize; x++) {
        const xEdge = x * GRID_STRIDE - CUBE_SIZE / 2;  // Edge position
        positions.push(xEdge, yPos, -halfSize * GRID_STRIDE - CUBE_SIZE / 2);
        positions.push(xEdge, yPos, halfSize * GRID_STRIDE + CUBE_SIZE / 2);
      }
    }

    // Vertical lines at cube corners
    for (let x = -halfSize; x <= halfSize; x++) {
      for (let z = -halfSize; z <= halfSize; z++) {
        const xEdge = x * GRID_STRIDE - CUBE_SIZE / 2;
        const zEdge = z * GRID_STRIDE - CUBE_SIZE / 2;
        positions.push(xEdge, 0, zEdge);
        positions.push(xEdge, levels * GRID_STRIDE, zEdge);
      }
    }

    return new Float32Array(positions);
  }, [size, levels]);

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={gridLines.length / 3}
          array={gridLines}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#94a3b8" transparent opacity={0.4} />
    </lineSegments>
  );
};

interface PlacedCube {
  id: string;
  variationId: string;
  position: [number, number, number];
  rotation: Rotation;
}

// Helper to calculate adjacent cube position and face based on face normal
function getAdjacentPositionAndFace(
  cubePosition: [number, number, number],
  faceNormal: THREE.Vector3
): { position: [number, number, number]; face: Face } {
  // Determine dominant axis of the face normal
  const absX = Math.abs(faceNormal.x);
  const absY = Math.abs(faceNormal.y);
  const absZ = Math.abs(faceNormal.z);

  let offset: [number, number, number] = [0, 0, 0];
  let face: Face = 'Y_POS';

  if (absX > absY && absX > absZ) {
    // X face
    offset = [Math.sign(faceNormal.x) * GRID_STRIDE, 0, 0];
    face = faceNormal.x > 0 ? 'X_POS' : 'X_NEG';
  } else if (absY > absX && absY > absZ) {
    // Y face (top/bottom)
    offset = [0, Math.sign(faceNormal.y) * GRID_STRIDE, 0];
    face = faceNormal.y > 0 ? 'Y_POS' : 'Y_NEG';
  } else {
    // Z face
    offset = [0, 0, Math.sign(faceNormal.z) * GRID_STRIDE];
    face = faceNormal.z > 0 ? 'Z_POS' : 'Z_NEG';
  }

  return {
    position: [
      cubePosition[0] + offset[0],
      cubePosition[1] + offset[1],
      cubePosition[2] + offset[2]
    ],
    face
  };
}

// Face hover info for connection rules
interface FaceHoverInfo {
  adjacentPosition: [number, number, number];
  existingCubeFace: Face;
  existingVariationId: string;
  existingRotation: Rotation;
}

// Renders a cube with actual CSG boolean cuts
const CubeWithCuts: React.FC<{
  variation: CubeVariation;
  position: [number, number, number];
  rotation?: Rotation;
  opacity?: number;
  selected?: boolean;
  validPlacement?: boolean | null;  // null = no indicator, true = green, false = red
  onClick?: () => void;
  onFaceHover?: (info: FaceHoverInfo | null) => void;
  isPreview?: boolean;
  clippingPlanes?: THREE.Plane[];
}> = ({ variation, position, rotation = DEFAULT_ROTATION, opacity = 1, selected, validPlacement, onClick, onFaceHover, isPreview = false, clippingPlanes }) => {
  // Load geometry - async for GLB, sync for CSG
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadGeometry = async () => {
      try {
        const geo = await getVariationGeometryAsync(variation);
        if (!cancelled) {
          setGeometry(geo);
        }
      } catch (error) {
        console.error(`Failed to load geometry for ${variation.id}:`, error);
        if (!cancelled) {
          // Fallback to simple box
          setGeometry(new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE));
        }
      }
    };

    loadGeometry();

    return () => { cancelled = true; };
  }, [variation]);

  // Geometry offset: geometry is at (0,0,0)-(42,42,42), so center it at origin
  // This ensures rotation happens around the cube's center
  const geometryOffset: [number, number, number] = [
    -CUBE_SIZE / 2,
    -CUBE_SIZE / 2,
    -CUBE_SIZE / 2
  ];

  // Combined rotation: Y-axis then X-axis (in radians)
  const yRotationRad = (rotation.y * Math.PI) / 2;
  const xRotationRad = (rotation.x * Math.PI) / 2;

  // Disable raycasting for preview cubes
  const noRaycast = isPreview ? () => null : undefined;

  const handlePointerMove = (e: any) => {
    if (isPreview || !onFaceHover) return;
    e.stopPropagation();
    if (e.face?.normal) {
      // Need to account for the cube's rotation when determining the face
      // The face normal is in world space, but we need to map it back
      const worldNormal = e.face.normal.clone();
      // Rotate the normal back by inverse of combined rotation to get the local face
      // Combined rotation is Y then X, so inverse is -X then -Y
      const inverseX = new THREE.Matrix4().makeRotationX(-xRotationRad);
      const inverseY = new THREE.Matrix4().makeRotationY(-yRotationRad);
      worldNormal.applyMatrix4(inverseX).applyMatrix4(inverseY);

      const { position: adjPos, face } = getAdjacentPositionAndFace(position, e.face.normal);
      onFaceHover({
        adjacentPosition: adjPos,
        existingCubeFace: face,
        existingVariationId: variation.id,
        existingRotation: rotation
      });
    }
  };

  // Create edge geometry for clean outlines (must be before early return for hooks rules)
  const edgesGeometry = useMemo(() => {
    if (!geometry) return null;
    return new THREE.EdgesGeometry(geometry, 15);  // 15 degree threshold
  }, [geometry]);

  // Determine colors - clean architectural style
  let fillColor = '#ffffff';  // White fill
  let edgeColor = '#000000';  // Black edges

  if (selected) {
    fillColor = '#e0e0ff';  // Light purple tint
    edgeColor = '#4444ff';  // Purple edges
  }
  if (validPlacement === true) {
    fillColor = '#b8f5b8';  // More saturated green tint
    edgeColor = '#15803d';  // Darker green edges
  }
  if (validPlacement === false) {
    fillColor = '#ffe0e0';  // Light red tint
    edgeColor = '#ef4444';  // Red edges
  }

  // Don't render until geometry is loaded
  if (!geometry || !edgesGeometry) return null;

  return (
    <group
      position={position}
      rotation={[xRotationRad, yRotationRad, 0]}
      onClick={isPreview ? undefined : (e) => { e.stopPropagation(); onClick?.(); }}
      onPointerMove={handlePointerMove}
      onPointerOut={isPreview ? undefined : () => onFaceHover?.(null)}
    >
      {/* Flat white/gray fill - no lighting */}
      <mesh geometry={geometry} position={geometryOffset} raycast={noRaycast}>
        <meshBasicMaterial
          color={fillColor}
          transparent={opacity < 1}
          opacity={opacity}
          side={THREE.FrontSide}
          clippingPlanes={clippingPlanes || []}
        />
      </mesh>
      {/* Section cap fill - back faces shown at cut (dark gray) */}
      {clippingPlanes && clippingPlanes.length > 0 && (
        <mesh geometry={geometry} position={geometryOffset} raycast={noRaycast}>
          <meshBasicMaterial
            color="#404040"
            side={THREE.BackSide}
            clippingPlanes={clippingPlanes}
          />
        </mesh>
      )}
      {/* Clean black edge lines */}
      <lineSegments geometry={edgesGeometry} position={geometryOffset} raycast={noRaycast}>
        <lineBasicMaterial
          color={edgeColor}
          linewidth={2}
          transparent={opacity < 1}
          opacity={opacity}
          clippingPlanes={clippingPlanes || []}
        />
      </lineSegments>
    </group>
  );
};

// Thumbnail using pre-rendered static images
const CubeThumbnail: React.FC<{
  variation: CubeVariation;
  selected: boolean;
  onClick: () => void;
}> = ({ variation, selected, onClick }) => {
  return (
    <div
      onClick={onClick}
      style={{
        width: 70,
        height: 70,
        borderRadius: 6,
        cursor: 'pointer',
        border: selected ? '2px solid #818cf8' : '2px solid transparent',
        background: selected ? '#4f46e5' : '#1e293b',
        overflow: 'hidden'
      }}
    >
      <img
        src={`/thumbnails/${variation.id}.png`}
        alt={variation.id}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }}
      />
    </div>
  );
};

// Rules toggle with expandable details
const RulesToggle: React.FC<{ enabled: boolean; onChange: (enabled: boolean) => void }> = ({ enabled, onChange }) => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
        <span
          onClick={() => setShowDetails(!showDetails)}
          style={{
            color: enabled ? '#22c55e' : '#94a3b8',
            fontSize: 12,
            cursor: 'pointer',
            textDecoration: 'underline',
            textDecorationStyle: 'dotted'
          }}
        >
          Rules {showDetails ? '▼' : '▶'}
        </span>
      </div>
      {showDetails && (
        <div style={{
          marginTop: 8,
          marginLeft: 24,
          padding: 8,
          background: '#1e293b',
          borderRadius: 4,
          fontSize: 11,
          color: '#94a3b8',
          lineHeight: 1.6
        }}>
          <div style={{ color: '#22c55e' }}>✓ Door ↔ Door (sphere↔sphere)</div>
          <div style={{ color: '#22c55e' }}>✓ Window ↔ Window (cylinder↔cylinder)</div>
          <div style={{ color: '#ef4444' }}>✗ Wall ↔ anything (blocks growth)</div>
          <div style={{ color: '#ef4444' }}>✗ Door ↔ Window</div>
        </div>
      )}
    </div>
  );
};

const StrictRulesToggle: React.FC<{ enabled: boolean; onChange: (enabled: boolean) => void; disabled?: boolean }> = ({ enabled, onChange, disabled }) => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          style={{ cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}
        />
        <span
          onClick={() => !disabled && setShowDetails(!showDetails)}
          style={{
            color: disabled ? '#64748b' : (enabled ? '#f59e0b' : '#94a3b8'),
            fontSize: 12,
            cursor: disabled ? 'not-allowed' : 'pointer',
            textDecoration: 'underline',
            textDecorationStyle: 'dotted',
            opacity: disabled ? 0.5 : 1
          }}
        >
          Strict Alignment {showDetails ? '▼' : '▶'}
        </span>
      </div>
      {showDetails && (
        <div style={{
          marginTop: 8,
          marginLeft: 24,
          padding: 8,
          background: '#1e293b',
          borderRadius: 4,
          fontSize: 11,
          color: '#94a3b8',
          lineHeight: 1.6
        }}>
          <div style={{ marginBottom: 4, color: '#f59e0b' }}>Additional constraints:</div>
          <div style={{ color: '#94a3b8' }}>• Sphere ↔ Sphere: centers must align</div>
          <div style={{ color: '#94a3b8' }}>• Cylinder ↔ Cylinder: centers must align</div>
          <div style={{ color: '#94a3b8', marginTop: 4, fontSize: 10 }}>
            (Tolerance: ~10% of cutter radius)
          </div>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [placedCubes, setPlacedCubes] = useState<PlacedCube[]>([]);
  const [hoverPos, setHoverPos] = useState<[number, number, number] | null>(null);
  const [hoverInfo, setHoverInfo] = useState<FaceHoverInfo | null>(null);  // Info about the face being hovered
  const [previewRotation, setPreviewRotation] = useState<Rotation>(DEFAULT_ROTATION);
  const [selectedCubeId, setSelectedCubeId] = useState<string | null>(null);
  // Shell is always enabled (uniform wall thickness)
  const [isGenerating, setIsGenerating] = useState(true);
  const [pickerActive, setPickerActive] = useState(true);
  const [rulesEnabled, setRulesEnabled] = useState(true);  // Toggle for connection rules
  const [strictRulesEnabled, setStrictRulesEnabled] = useState(false);  // Toggle for strict alignment rules

  // PWA install prompt state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);

  // Section plane state
  const [sectionEnabled, setSectionEnabled] = useState(false);
  const [sectionAxis, setSectionAxis] = useState<'x' | 'y' | 'z'>('y');
  const [sectionPosition, setSectionPosition] = useState(50);  // Position along axis

  // Create clipping plane based on section settings
  const clippingPlanes = useMemo(() => {
    if (!sectionEnabled) return [];
    const normal = new THREE.Vector3(
      sectionAxis === 'x' ? -1 : 0,
      sectionAxis === 'y' ? -1 : 0,
      sectionAxis === 'z' ? -1 : 0
    );
    return [new THREE.Plane(normal, sectionPosition)];
  }, [sectionEnabled, sectionAxis, sectionPosition]);

  // Undo/redo history
  const [history, setHistory] = useState<PlacedCube[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const selectedVariation = CUBE_VARIATIONS[selectedIdx];

  // Calculate valid rotations for current hover position by checking ALL adjacent cubes
  const validRotations = useMemo((): Rotation[] => {
    if (!rulesEnabled || !hoverPos) {
      return getAllRotations();
    }

    // Convert placedCubes to PlacedCubeInfo format
    const cubeInfos: PlacedCubeInfo[] = placedCubes.map(c => ({
      variationId: c.variationId,
      position: c.position,
      rotation: c.rotation
    }));

    return findValidRotationsAtPosition(
      hoverPos,
      selectedVariation.id,
      cubeInfos,
      GRID_STRIDE,
      strictRulesEnabled && rulesEnabled
    );
  }, [hoverPos, placedCubes, selectedVariation, rulesEnabled, strictRulesEnabled]);

  // Calculate if current placement is valid based on connection rules
  const placementValidity = useMemo(() => {
    if (!hoverPos) return { valid: true, rotation: previewRotation };

    // Check if current preview rotation is valid
    const isCurrentValid = findRotationIndex(validRotations, previewRotation) !== -1;
    if (isCurrentValid) {
      return { valid: true, rotation: previewRotation };
    }

    // If current rotation not valid, use first valid one (or indicate invalid)
    if (validRotations.length > 0) {
      return { valid: true, rotation: validRotations[0] };
    }

    return { valid: false, rotation: previewRotation };
  }, [hoverPos, validRotations, previewRotation]);

  // Pre-generate geometries on mount (only for CSG mode)
  useEffect(() => {
    if (USE_PRECOMPUTED_MODELS) {
      // Skip CSG pre-generation when using GLB files
      console.log('Using pre-computed GLB models, skipping CSG generation');
      setIsGenerating(false);
      return;
    }
    const timer = setTimeout(() => {
      try {
        preGenerateAllGeometries();
      } catch (error) {
        console.error('Error pre-generating geometries:', error);
      }
      setIsGenerating(false);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // PWA install prompt handler
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e);
      // Show the install button
      setShowInstallButton(true);
      console.log('PWA install prompt captured');
    };

    const handleAppInstalled = () => {
      // Hide the install button after successful installation
      setShowInstallButton(false);
      setDeferredPrompt(null);
      console.log('PWA installed successfully');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape - release picker
      if (e.key === 'Escape') {
        setPickerActive(false);
        setHoverPos(null);
        setHoverInfo(null);
        setSelectedCubeId(null);
      }

      // Spacebar - cycle through Y-axis rotations (horizontal spin)
      // When valid rotations exist, cycle through only those
      // When NO valid rotations exist (red), still allow cycling through all rotations
      if (e.key === ' ' && pickerActive && hoverPos) {
        e.preventDefault();
        const rotationsToUse: Rotation[] = validRotations.length > 0 ? validRotations : getAllRotations();
        setPreviewRotation(prev => {
          // Use the currently displayed rotation as the starting point
          const currentRotation = findRotationIndex(validRotations, prev) === -1 && validRotations.length > 0
            ? validRotations[0]
            : prev;
          const currentIdx = findRotationIndex(rotationsToUse, currentRotation);
          if (currentIdx === -1) {
            return rotationsToUse[0];
          }
          const nextIdx = (currentIdx + 1) % rotationsToUse.length;
          return rotationsToUse[nextIdx];
        });
      }

      // R key - cycle through X-axis rotations (tip forward/back)
      // This allows accessing faces that Y-rotation alone cannot reach
      if (e.key === 'r' && pickerActive && hoverPos) {
        e.preventDefault();
        setPreviewRotation(prev => ({
          ...prev,
          x: ((prev.x + 1) % 4) as AxisRotation
        }));
      }

      // Spacebar - rotate selected placed cube (Y-axis)
      if (e.key === ' ' && selectedCubeId && !pickerActive) {
        e.preventDefault();
        rotateSelectedCube('y');
      }

      // R key - rotate selected placed cube (X-axis)
      if (e.key === 'r' && selectedCubeId && !pickerActive) {
        e.preventDefault();
        rotateSelectedCube('x');
      }

      // Undo: Cmd/Ctrl + Z
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Redo: Cmd/Ctrl + Shift + Z
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
      // Delete key - delete selected cube
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCubeId) {
        e.preventDefault();
        handleDelete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history, selectedCubeId, pickerActive, hoverPos, validRotations, placedCubes, rulesEnabled]);

  const pushToHistory = (newCubes: PlacedCube[]) => {
    // Remove any redo states beyond current index
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newCubes);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setPlacedCubes(history[newIndex]);
      setSelectedCubeId(null);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setPlacedCubes(history[newIndex]);
      setSelectedCubeId(null);
    }
  };

  // Rotate selected placed cube
  const rotateSelectedCube = (axis: 'x' | 'y') => {
    if (!selectedCubeId) return;

    const cubeIndex = placedCubes.findIndex(c => c.id === selectedCubeId);
    if (cubeIndex === -1) return;

    const cube = placedCubes[cubeIndex];
    const newRotation: Rotation = axis === 'y'
      ? { ...cube.rotation, y: ((cube.rotation.y + 1) % 4) as AxisRotation }
      : { ...cube.rotation, x: ((cube.rotation.x + 1) % 4) as AxisRotation };

    // Check if new rotation is valid with connection rules
    if (rulesEnabled) {
      // Get all OTHER placed cubes (not the one being rotated)
      const otherCubes: PlacedCubeInfo[] = placedCubes
        .filter(c => c.id !== selectedCubeId)
        .map(c => ({
          variationId: c.variationId,
          position: c.position,
          rotation: c.rotation
        }));

      const validRotations = findValidRotationsAtPosition(
        cube.position,
        cube.variationId,
        otherCubes,
        GRID_STRIDE,
        strictRulesEnabled && rulesEnabled
      );

      // Check if the new rotation is in the valid list
      const isValid = findRotationIndex(validRotations, newRotation) !== -1;
      if (!isValid) {
        // Skip to next valid rotation if current one invalid
        if (validRotations.length > 0) {
          const currentIdx = findRotationIndex(validRotations, cube.rotation);
          const nextRotation = currentIdx === -1
            ? validRotations[0]
            : validRotations[(currentIdx + 1) % validRotations.length];

          const newCubes = [...placedCubes];
          newCubes[cubeIndex] = { ...cube, rotation: nextRotation };
          pushToHistory(newCubes);
          setPlacedCubes(newCubes);
        }
        return;
      }
    }

    // Apply the rotation
    const newCubes = [...placedCubes];
    newCubes[cubeIndex] = { ...cube, rotation: newRotation };
    pushToHistory(newCubes);
    setPlacedCubes(newCubes);
  };

  // Auto-fill: greedy growth algorithm
  // If a cube is selected, grow only from that cube. Otherwise grow from anywhere.
  const handleAutoFill = (count: number) => {
    let currentCubes = [...placedCubes];
    let seedCubeId = selectedCubeId;

    // If no cubes placed, start with one at origin
    if (currentCubes.length === 0) {
      const randomVariation = CUBE_VARIATIONS[Math.floor(Math.random() * CUBE_VARIATIONS.length)];
      const seedCube = {
        id: `cube-${Date.now()}`,
        variationId: randomVariation.id,
        position: [0, CUBE_SIZE / 2, 0] as [number, number, number],
        rotation: DEFAULT_ROTATION
      };
      currentCubes.push(seedCube);
      seedCubeId = seedCube.id;
    }

    // Track which cubes are "frontier" (can grow from them)
    // If a cube is selected, only that cube is the seed
    // Otherwise, all cubes are potential growth points
    let frontierIds: Set<string> = seedCubeId
      ? new Set([seedCubeId])
      : new Set(currentCubes.map(c => c.id));

    for (let i = 0; i < count; i++) {
      const candidates: { position: [number, number, number]; variationId: string; rotation: Rotation }[] = [];

      // Get frontier cubes
      const frontierCubes = currentCubes.filter(c => frontierIds.has(c.id));

      // Get all positions adjacent to frontier cubes
      const adjacentPositions = new Set<string>();
      for (const cube of frontierCubes) {
        const [x, y, z] = cube.position;
        const neighbors: [number, number, number][] = [
          [x + GRID_STRIDE, y, z],
          [x - GRID_STRIDE, y, z],
          [x, y + GRID_STRIDE, z],
          [x, y - GRID_STRIDE, z],
          [x, y, z + GRID_STRIDE],
          [x, y, z - GRID_STRIDE],
        ];

        for (const pos of neighbors) {
          if (pos[1] < CUBE_SIZE / 2) continue;
          const occupied = currentCubes.some(c =>
            Math.abs(c.position[0] - pos[0]) < 1 &&
            Math.abs(c.position[1] - pos[1]) < 1 &&
            Math.abs(c.position[2] - pos[2]) < 1
          );
          if (occupied) continue;
          adjacentPositions.add(JSON.stringify(pos));
        }
      }

      // For each adjacent position, find valid variation+rotation combos
      for (const posStr of adjacentPositions) {
        const position = JSON.parse(posStr) as [number, number, number];

        for (const variation of CUBE_VARIATIONS) {
          const cubeInfos: PlacedCubeInfo[] = currentCubes.map(c => ({
            variationId: c.variationId,
            position: c.position,
            rotation: c.rotation
          }));

          const validRotations = findValidRotationsAtPosition(
            position,
            variation.id,
            cubeInfos,
            GRID_STRIDE,
            strictRulesEnabled
          );

          for (const rotation of validRotations) {
            candidates.push({ position, variationId: variation.id, rotation });
          }
        }
      }

      if (candidates.length === 0) {
        console.log(`Auto-fill stopped after ${i} placements - no valid positions found`);
        break;
      }

      // Pick a random candidate
      const choice = candidates[Math.floor(Math.random() * candidates.length)];
      const newCube = {
        id: `cube-${Date.now()}-${i}`,
        variationId: choice.variationId,
        position: choice.position,
        rotation: choice.rotation
      };
      currentCubes.push(newCube);

      // Add new cube to frontier (so growth continues from newly placed cubes)
      frontierIds.add(newCube.id);
    }

    pushToHistory(currentCubes);
    setPlacedCubes(currentCubes);
    setSelectedCubeId(null);
  };

  // Grow from seed: place the selected variation at a valid adjacent position
  const handleGrowSelected = () => {
    const variationId = selectedVariation.id;

    // If no cubes placed, place at origin
    if (placedCubes.length === 0) {
      const newCube: PlacedCube = {
        id: `cube-${Date.now()}`,
        variationId,
        position: [0, CUBE_SIZE / 2, 0],
        rotation: DEFAULT_ROTATION
      };
      const newCubes = [newCube];
      pushToHistory(newCubes);
      setPlacedCubes(newCubes);
      return;
    }

    // Find all valid adjacent positions for this specific variation
    const candidates: { position: [number, number, number]; rotation: Rotation }[] = [];

    // Get all positions adjacent to existing cubes
    const adjacentPositions = new Set<string>();
    for (const cube of placedCubes) {
      const [x, y, z] = cube.position;
      const neighbors: [number, number, number][] = [
        [x + GRID_STRIDE, y, z],
        [x - GRID_STRIDE, y, z],
        [x, y + GRID_STRIDE, z],
        [x, y - GRID_STRIDE, z],
        [x, y, z + GRID_STRIDE],
        [x, y, z - GRID_STRIDE],
      ];

      for (const pos of neighbors) {
        if (pos[1] < CUBE_SIZE / 2) continue;
        const occupied = placedCubes.some(c =>
          Math.abs(c.position[0] - pos[0]) < 1 &&
          Math.abs(c.position[1] - pos[1]) < 1 &&
          Math.abs(c.position[2] - pos[2]) < 1
        );
        if (occupied) continue;
        adjacentPositions.add(JSON.stringify(pos));
      }
    }

    // For each position, check if selected variation can be placed
    for (const posStr of adjacentPositions) {
      const position = JSON.parse(posStr) as [number, number, number];

      const cubeInfos: PlacedCubeInfo[] = placedCubes.map(c => ({
        variationId: c.variationId,
        position: c.position,
        rotation: c.rotation
      }));

      const validRotations = findValidRotationsAtPosition(
        position,
        variationId,
        cubeInfos,
        GRID_STRIDE,
        strictRulesEnabled
      );

      for (const rotation of validRotations) {
        candidates.push({ position, rotation });
      }
    }

    if (candidates.length === 0) {
      console.log(`No valid position found for ${variationId}`);
      return;
    }

    // Pick a random valid spot
    const choice = candidates[Math.floor(Math.random() * candidates.length)];
    const newCube: PlacedCube = {
      id: `cube-${Date.now()}`,
      variationId,
      position: choice.position,
      rotation: choice.rotation
    };

    const newCubes = [...placedCubes, newCube];
    pushToHistory(newCubes);
    setPlacedCubes(newCubes);
  };

  const handlePlace = () => {
    if (!hoverPos) return;

    // Check if placement is valid (if rules enabled)
    if (rulesEnabled && !placementValidity.valid) return;

    const occupied = placedCubes.some(c =>
      c.position[0] === hoverPos[0] &&
      c.position[1] === hoverPos[1] &&
      c.position[2] === hoverPos[2]
    );
    if (!occupied) {
      const newCubes = [...placedCubes, {
        id: `cube-${Date.now()}`,
        variationId: selectedVariation.id,
        position: hoverPos,
        rotation: placementValidity.rotation
      }];
      setPlacedCubes(newCubes);
      pushToHistory(newCubes);
    }
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      console.log('No install prompt available');
      return;
    }

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);

    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }

    // Clear the deferred prompt
    setDeferredPrompt(null);
    setShowInstallButton(false);
  };

  const handleDelete = () => {
    if (selectedCubeId) {
      const newCubes = placedCubes.filter(c => c.id !== selectedCubeId);
      setPlacedCubes(newCubes);
      pushToHistory(newCubes);
      setSelectedCubeId(null);
    }
  };

  const handleClearAll = () => {
    if (placedCubes.length > 0) {
      setPlacedCubes([]);
      pushToHistory([]);
      setSelectedCubeId(null);
    }
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{
        width: '250px',
        minWidth: '250px',
        maxWidth: '250px',
        flexBasis: '250px',
        flexShrink: 0,
        flexGrow: 0,
        position: 'relative',
        background: '#0f172a',
        borderRight: '1px solid #1e293b',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <h1 style={{ color: 'white', fontSize: 18, marginBottom: 8 }}>Cuboid Studio</h1>
        <p style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
          {CUBE_VARIATIONS.length} variations • {placedCubes.length} placed
          {isGenerating && <span style={{ color: '#fbbf24' }}> • Generating...</span>}
        </p>

        {/* Connection rules toggle */}
        <RulesToggle enabled={rulesEnabled} onChange={setRulesEnabled} />

        {/* Strict alignment rules toggle */}
        <StrictRulesToggle
          enabled={strictRulesEnabled}
          onChange={setStrictRulesEnabled}
          disabled={!rulesEnabled}
        />

        {/* Install PWA section */}
        <div style={{
          marginBottom: 12,
          padding: 10,
          background: showInstallButton ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#1e293b',
          border: showInstallButton ? '1px solid #1e40af' : '1px solid #334155',
          borderRadius: 6
        }}>
          {showInstallButton ? (
            <button
              onClick={handleInstallClick}
              style={{
                width: '100%',
                padding: 0,
                background: 'transparent',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <span>📦</span>
              Install App
            </button>
          ) : (
            <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: '#cbd5e1' }}>📦 Install as App</div>
              <div style={{ fontSize: 10 }}>
                Chrome: Menu (⋮) → <span style={{ color: '#60a5fa' }}>Install Cuboid Studio</span>
              </div>
            </div>
          )}
        </div>

        <div style={{
          flex: 1,
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
          padding: 4
        }}>
          {CUBE_VARIATIONS.map((v, i) => (
            <CubeThumbnail
              key={v.id}
              variation={v}
              selected={selectedIdx === i}
              onClick={() => setSelectedIdx(i)}
            />
          ))}
        </div>

        {/* Undo/Redo buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            style={{
              flex: 1, padding: 8, background: '#1e293b', border: '1px solid #334155',
              borderRadius: 6, color: historyIndex > 0 ? '#94a3b8' : '#475569',
              cursor: historyIndex > 0 ? 'pointer' : 'default', fontSize: 11
            }}
          >
            Undo
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            style={{
              flex: 1, padding: 8, background: '#1e293b', border: '1px solid #334155',
              borderRadius: 6, color: historyIndex < history.length - 1 ? '#94a3b8' : '#475569',
              cursor: historyIndex < history.length - 1 ? 'pointer' : 'default', fontSize: 11
            }}
          >
            Redo
          </button>
        </div>

        {/* Section plane controls */}
        <div style={{ marginTop: 12, borderTop: '1px solid #334155', paddingTop: 12 }}>
          {sectionEnabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['x', 'y', 'z'] as const).map(axis => (
                  <button
                    key={axis}
                    onClick={() => setSectionAxis(axis)}
                    style={{
                      flex: 1, padding: 4, fontSize: 11,
                      background: sectionAxis === axis ? '#f59e0b' : '#1e293b',
                      color: sectionAxis === axis ? 'black' : '#94a3b8',
                      border: 'none', borderRadius: 4, cursor: 'pointer'
                    }}
                  >
                    {axis.toUpperCase()}
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={-100}
                max={200}
                value={sectionPosition}
                onChange={(e) => setSectionPosition(Number(e.target.value))}
                style={{ width: '100%' }}
              />
              <span style={{ color: '#64748b', fontSize: 10, textAlign: 'center' }}>
                {sectionAxis.toUpperCase()} = {sectionPosition}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={sectionEnabled}
              onChange={(e) => setSectionEnabled(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ color: sectionEnabled ? '#f59e0b' : '#64748b', fontSize: 12 }}>
              Section Cut
            </span>
          </div>
        </div>

        {/* Auto-fill buttons */}
        <div style={{ marginTop: 12, borderTop: '1px solid #334155', paddingTop: 12 }}>
          <p style={{ color: '#64748b', fontSize: 11, marginBottom: 8 }}>
            Grow {selectedCubeId ? 'from selected' : '(random)'}
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => handleAutoFill(5)}
              style={{
                flex: 1, padding: 8, background: '#065f46', border: 'none',
                borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 11
              }}
            >
              +5
            </button>
            <button
              onClick={() => handleAutoFill(10)}
              style={{
                flex: 1, padding: 8, background: '#065f46', border: 'none',
                borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 11
              }}
            >
              +10
            </button>
            <button
              onClick={() => handleAutoFill(25)}
              style={{
                flex: 1, padding: 8, background: '#065f46', border: 'none',
                borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 11
              }}
            >
              +25
            </button>
          </div>
        </div>

        {placedCubes.length > 0 && (
          <button
            onClick={handleClearAll}
            style={{
              marginTop: 8, padding: 10, background: '#7f1d1d', border: 'none',
              borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 12
            }}
          >
            Clear All
          </button>
        )}
      </div>

      {/* Canvas */}
      <div style={{
        flex: 1,
        flexShrink: 1,
        flexGrow: 1,
        position: 'relative',
        minWidth: 0,
        overflow: 'hidden'
      }}>
        <Canvas
          camera={{ position: [150, 150, 150], fov: 50 }}
          style={{ background: '#f1f5f9' }}
          gl={{ localClippingEnabled: true }}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[50, 50, 50]} intensity={0.8} />
          <OrbitControls
            mouseButtons={{
              LEFT: undefined,  // Free up left-click for placement
              MIDDLE: THREE.MOUSE.DOLLY,
              RIGHT: THREE.MOUSE.ROTATE
            }}
          />
          <SpatialGrid size={7} levels={4} />

          {/* Placed cubes */}
          {placedCubes.map(cube => {
            const variation = CUBE_VARIATIONS.find(v => v.id === cube.variationId);
            if (!variation) return null;
            return (
              <CubeWithCuts
                key={cube.id}
                variation={variation}
                position={cube.position}
                rotation={cube.rotation}
                selected={cube.id === selectedCubeId}
                clippingPlanes={clippingPlanes}
                onClick={() => {
                  if (selectedCubeId === cube.id) {
                    setSelectedCubeId(null);
                  } else if (!hoverPos) {
                    setSelectedCubeId(cube.id);
                  } else {
                    handlePlace();
                  }
                }}
                onFaceHover={(info) => {
                  if (pickerActive && !selectedCubeId) {
                    if (info) {
                      setHoverPos(info.adjacentPosition);
                      setHoverInfo(info);
                    } else {
                      setHoverInfo(null);
                    }
                  }
                }}
              />
            );
          })}

          {/* Hover preview */}
          {pickerActive && hoverPos && !selectedCubeId && (
            <CubeWithCuts
              variation={selectedVariation}
              position={hoverPos}
              rotation={placementValidity.rotation}
              opacity={0.8}
              validPlacement={rulesEnabled ? placementValidity.valid : null}
              isPreview
            />
          )}

          {/* Click plane (ground) */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerMove={(e) => {
              if (!pickerActive) return;
              e.stopPropagation();
              const x = Math.round(e.point.x / GRID_STRIDE) * GRID_STRIDE;
              const z = Math.round(e.point.z / GRID_STRIDE) * GRID_STRIDE;
              setHoverPos([x, CUBE_SIZE / 2, z]);
              setHoverInfo(null);  // Ground placement, no face info
            }}
            onPointerOut={() => {
              setHoverPos(null);
              setHoverInfo(null);
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (!pickerActive) {
                setPickerActive(true);
                return;
              }
              if (!selectedCubeId) handlePlace();
            }}
          >
            <planeGeometry args={[500, 500]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        </Canvas>

        {/* Selected cube panel */}
        {selectedCubeId && (
          <div style={{
            position: 'absolute', top: 16, right: 16,
            background: '#0f172a', border: '1px solid #334155',
            borderRadius: 8, padding: 16, width: 200
          }}>
            <p style={{ color: 'white', fontSize: 14, marginBottom: 8 }}>Selected Cube</p>
            <p style={{ color: '#64748b', fontSize: 11, marginBottom: 12 }}>
              {placedCubes.find(c => c.id === selectedCubeId)?.variationId}
            </p>
            <button
              onClick={handleDelete}
              style={{
                width: '100%', padding: 8, background: '#7f1d1d',
                border: 'none', borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 12
              }}
            >
              Delete
            </button>
          </div>
        )}

        {/* Help text */}
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          background: '#0f172aCC', padding: '8px 16px', borderRadius: 8,
          color: '#64748b', fontSize: 11
        }}>
          Click to place • Space to rotate • R to tip • Esc to release • Right-drag to orbit
        </div>
      </div>
    </div>
  );
};

export default App;
