import React, { useMemo, useEffect, useRef } from 'react';
import { useAccent } from '../../contexts/AccentContext';
import { Canvas, useThree } from '@react-three/fiber';
import { ViewportControls } from './ViewportControls';
import { CameraController } from './CameraController';
import { ViewportCameraToggle } from './ViewportCameraToggle';
import { ZoomToCube } from './ZoomToCube';
import * as THREE from 'three';
import {
  registerCaptureFunction,
  unregisterCaptureFunction,
} from '../../lib/capture/screenshotCapture';
import { CUBE_VARIATIONS } from '../../lib/cube/specifications';
import { CUBE_SIZE, GRID_STRIDE } from '../../lib/cube/constants';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useClippingPlanes } from '../../hooks/useClippingPlanes';
import { useAppStore } from '../../store/useAppStore';
import { SpatialGrid } from './SpatialGrid';
import { Grid } from '@react-three/drei';
import { gridExtentFromPositions } from '../../lib/viewport/spatialGridExtent';
import { CubeWithCuts } from './CubeWithCuts';
import { checkableId, summarizeConnections, toCheckableCubes } from '../../lib/cube/connectionViolations';
import { FaceHoverInfo } from '../../lib/cube/types';
import { useMemeStore } from '../../store/useMemeStore';
import { useEncodingStore } from '../../store/useEncodingStore';
import { remixDecisions } from '../../lib/encoding/remixDecisions';
import { useEvolutionStore } from '../../store/useEvolutionStore';
import { createCutterFromLLMOutput } from '../../lib/operators/applyOperator';
import { useCoarsePointer } from '../../hooks/useCoarsePointer';

function snapGroundHoverPos(point: { x: number; z: number }): [number, number, number] {
  const x = Math.round(point.x / GRID_STRIDE) * GRID_STRIDE;
  const z = Math.round(point.z / GRID_STRIDE) * GRID_STRIDE;
  return [x, CUBE_SIZE / 2, z];
}

/** Builder mode scene contents */
const BuilderScene: React.FC = () => {
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const selectedCubeIds = useBuilderStore(s => s.selectedCubeIds);
  const setSelectedCubeIds = useBuilderStore(s => s.setSelectedCubeIds);
  const hoverPos = useBuilderStore(s => s.hoverPos);
  const setHoverPos = useBuilderStore(s => s.setHoverPos);
  const setHoverInfo = useBuilderStore(s => s.setHoverInfo);
  const pickerActive = useBuilderStore(s => s.pickerActive);
  const setPickerActive = useBuilderStore(s => s.setPickerActive);
  const rulesEnabled = useBuilderStore(s => s.rulesEnabled);
  const handlePlace = useBuilderStore(s => s.handlePlace);
  const selectedIdx = useBuilderStore(s => s.selectedIdx);
  const previewRotation = useBuilderStore(s => s.previewRotation);

  // Compute these outside of Zustand selectors to avoid infinite re-render loops
  // (getSelectedVariation/getPlacementValidity return new objects each call)
  const selectedVariation = useMemo(() => CUBE_VARIATIONS[selectedIdx], [selectedIdx]);
  const placementValidity = useMemo(
    () => useBuilderStore.getState().getPlacementValidity(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hoverPos, previewRotation, placedCubes, rulesEnabled]
  );

  // Track pointer-down position so we can distinguish a tap from an orbit drag.
  // If the finger moves more than 8px between down and up, it's a drag — skip placement.
  const pointerDownXY = useRef<{ x: number; y: number } | null>(null);
  const touchPlacement = useCoarsePointer();

  const clippingPlanes = useClippingPlanes();
  const gridExtent = useMemo(
    () => gridExtentFromPositions(placedCubes.map(c => c.position)),
    [placedCubes]
  );

  // Cubes that put a door against a window somewhere. Blank-wall closures are
  // deliberately not marked — see ConnectionSummary.mismatchCubeIds.
  const flaggedIds = useMemo(
    () => summarizeConnections(toCheckableCubes(placedCubes)).mismatchCubeIds,
    [placedCubes]
  );

  return (
    <>
      <SpatialGrid extent={gridExtent} />

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
            selected={selectedCubeIds.includes(cube.id)}
            flagged={flaggedIds.has(cube.id)}
            clippingPlanes={clippingPlanes}
            onClick={(nativeEvent) => {
              const isShift = nativeEvent.shiftKey;
              const isCtrlMeta = nativeEvent.ctrlKey || nativeEvent.metaKey;

              if (isCtrlMeta) {
                setSelectedCubeIds(selectedCubeIds.filter(id => id !== cube.id));
              } else if (isShift) {
                if (selectedCubeIds.includes(cube.id)) {
                  setSelectedCubeIds(selectedCubeIds.filter(id => id !== cube.id));
                } else {
                  setSelectedCubeIds([...selectedCubeIds, cube.id]);
                }
              } else if (selectedCubeIds.length > 1) {
                // Narrow multi-selection to just this cube
                setSelectedCubeIds([cube.id]);
              } else if (selectedCubeIds.length === 1 && selectedCubeIds[0] === cube.id) {
                setSelectedCubeIds([]);
              } else if (!hoverPos) {
                setSelectedCubeIds([cube.id]);
              } else if (!touchPlacement) {
                handlePlace();
              }
            }}
            onFaceHover={touchPlacement ? undefined : (info: FaceHoverInfo | null) => {
              if (pickerActive && selectedCubeIds.length === 0) {
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

      {/* Hover / touch ghost preview */}
      {pickerActive && hoverPos && selectedCubeIds.length === 0 && (
        <CubeWithCuts
          variation={selectedVariation}
          position={hoverPos}
          rotation={placementValidity.rotation}
          opacity={0.8}
          validPlacement={rulesEnabled ? placementValidity.valid : null}
          isPreview
        />
      )}

      {/* Ground click plane */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          pointerDownXY.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (touchPlacement || !pickerActive) return;
          e.stopPropagation();
          setHoverPos(snapGroundHoverPos(e.point));
          setHoverInfo(null);
        }}
        onPointerOut={() => {
          if (touchPlacement) return;
          setHoverPos(null);
          setHoverInfo(null);
        }}
        onClick={(e) => {
          // Ignore if the pointer moved significantly — that's an orbit drag, not a tap
          if (pointerDownXY.current) {
            const dx = e.clientX - pointerDownXY.current.x;
            const dy = e.clientY - pointerDownXY.current.y;
            if (dx * dx + dy * dy > 64) return; // 8 px threshold
          }
          e.stopPropagation();
          const snapped = snapGroundHoverPos(e.point);

          if (!pickerActive) {
            setPickerActive(true);
            if (touchPlacement) {
              setHoverPos(snapped);
              setHoverInfo(null);
            }
            return;
          }
          if (selectedCubeIds.length > 0) {
            setSelectedCubeIds([]);
            return;
          }

          if (touchPlacement) {
            setHoverPos(snapped);
            setHoverInfo(null);
            return;
          }
          handlePlace();
        }}
      >
        <planeGeometry args={[500, 500]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </>
  );
};

/** Cutter wireframe overlay — shared between standalone and assembly modes */
const CutterOverlay: React.FC<{ offset: [number, number, number] }> = ({ offset }) => {
  const lastCutterGeometry = useMemeStore(s => s.lastCutterGeometry);
  const cutterVisible = useMemeStore(s => s.cutterVisible);

  const cutterEdgesGeometry = React.useMemo(() => {
    if (!lastCutterGeometry) return null;
    return new THREE.EdgesGeometry(lastCutterGeometry, 1);
  }, [lastCutterGeometry]);

  if (!cutterVisible || !lastCutterGeometry || !cutterEdgesGeometry) return null;

  return (
    <>
      <mesh geometry={lastCutterGeometry} position={offset}>
        <meshBasicMaterial color="#b03a2e" transparent opacity={0.08} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={cutterEdgesGeometry} position={offset}>
        <lineBasicMaterial color="#b03a2e" linewidth={1} transparent opacity={0.6} />
      </lineSegments>
    </>
  );
};

/** Standalone pataphysical scene — single working cube, no assembly */
const StandalonePataphysicalScene: React.FC = () => {
  const workingGeometry = useMemeStore(s => s.workingGeometry);

  const edgesGeometry = React.useMemo(() => {
    if (!workingGeometry) return null;
    return new THREE.EdgesGeometry(workingGeometry, 15);
  }, [workingGeometry]);

  return (
    <>
      <SpatialGrid extent={{ minCellX: -1, maxCellX: 1, minCellZ: -1, maxCellZ: 1, levels: 2 }} />
      {workingGeometry && edgesGeometry && (
        <group position={[0, CUBE_SIZE / 2, 0]}>
          <mesh geometry={workingGeometry} position={[-CUBE_SIZE / 2, -CUBE_SIZE / 2, -CUBE_SIZE / 2]}>
            <meshBasicMaterial color="#ffffff" side={THREE.FrontSide} />
          </mesh>
          <lineSegments geometry={edgesGeometry} position={[-CUBE_SIZE / 2, -CUBE_SIZE / 2, -CUBE_SIZE / 2]}>
            <lineBasicMaterial color="#000000" linewidth={2} />
          </lineSegments>
          <CutterOverlay offset={[-CUBE_SIZE / 2, -CUBE_SIZE / 2, -CUBE_SIZE / 2]} />
        </group>
      )}
    </>
  );
};

/** Assembly pataphysical scene — builder cubes with per-cube meme overrides */
const AssemblyPataphysicalScene: React.FC = () => {
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const targetCubeId = useMemeStore(s => s.targetCubeId);
  const setTargetCubeId = useMemeStore(s => s.setTargetCubeId);
  const cubeGeometryOverrides = useMemeStore(s => s.cubeGeometryOverrides);

  // Find the targeted cube's position for the cutter overlay
  const targetCube = placedCubes.find(c => c.id === targetCubeId);
  const flaggedIds = useMemo(
    () => summarizeConnections(toCheckableCubes(placedCubes)).mismatchCubeIds,
    [placedCubes]
  );

  const gridExtent = useMemo(
    () => gridExtentFromPositions(placedCubes.map(c => c.position)),
    [placedCubes]
  );

  return (
    <>
      <SpatialGrid extent={gridExtent} />

      {/* Render all placed cubes, with overrides where they exist */}
      {placedCubes.map(cube => {
        const variation = CUBE_VARIATIONS.find(v => v.id === cube.variationId);
        if (!variation) return null;
        const override = cubeGeometryOverrides[cube.id] || null;
        return (
          <CubeWithCuts
            key={cube.id}
            variation={variation}
            position={cube.position}
            rotation={cube.rotation}
            overrideGeometry={override}
            targeted={cube.id === targetCubeId}
            flagged={flaggedIds.has(cube.id)}
            onClick={() => {
              setTargetCubeId(cube.id === targetCubeId ? null : cube.id);
            }}
          />
        );
      })}

      {/* Cutter wireframe at targeted cube's position */}
      {targetCube && (
        <group
          position={targetCube.position}
          rotation={[
            (targetCube.rotation.x * Math.PI) / 2,
            (targetCube.rotation.y * Math.PI) / 2,
            0,
          ]}
        >
          <CutterOverlay offset={[-CUBE_SIZE / 2, -CUBE_SIZE / 2, -CUBE_SIZE / 2]} />
        </group>
      )}

      {/* Click-away plane to deselect */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          setTargetCubeId(null);
        }}
      >
        <planeGeometry args={[500, 500]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </>
  );
};

/** Pataphysical mode scene — assembly if cubes exist, standalone otherwise */
const PataphysicalScene: React.FC = () => {
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const hasAssembly = placedCubes.length > 0;

  return hasAssembly ? <AssemblyPataphysicalScene /> : <StandalonePataphysicalScene />;
};

/** Encoding mode scene — preview of encoded assembly before loading into builder */
const EncodingScene: React.FC = () => {
  const encodedCubes = useEncodingStore(s => s.encodedCubes);
  const seedCubes = useEncodingStore(s => s.seedCubes);
  const seedCubeIds = useEncodingStore(s => s.seedCubeIds);
  const mode = useEncodingStore(s => s.mode);
  const showAdditions = useEncodingStore(s => s.showAdditions);
  const remixResultReplacesSeed = useEncodingStore(s => s.remixResultReplacesSeed);
  const resultApplied = useEncodingStore(s => s.resultApplied);
  const previousResult = useEncodingStore(s => s.previousResult);
  const showPreviousProposal = useEncodingStore(s => s.showPreviousProposal);
  const showDiscarded = useEncodingStore(s => s.showDiscarded);
  const placedCubes = useBuilderStore(s => s.placedCubes);

  // After a standalone load → edit → Done round-trip, `seedCubes` holds the
  // edited assembly (original encoded cubes + anything added in the builder).
  // Prefer it over the frozen `encodedCubes` snapshot so the preview matches
  // what the builder and evolution show. (In standalone, `seedCubes` is only
  // ever populated by closing the seed-edit overlay, so its presence means an
  // edit happened.)
  const editedStandalone = mode === 'standalone' && seedCubes.length > 0;

  // Original encoded cubes keyed by grid position. A cube in the edited
  // assembly that isn't at one of these positions was added in the builder.
  const encodedPositionKeys = useMemo(
    () => new Set((encodedCubes ?? []).map(c => c.position.join(','))),
    [encodedCubes]
  );

  const editedVisibleCubes = useMemo(() => {
    if (!editedStandalone) return [];
    return seedCubes.filter(
      c => showAdditions || encodedPositionKeys.has(c.position.join(','))
    );
  }, [editedStandalone, seedCubes, showAdditions, encodedPositionKeys]);

  // Remix v2: the result is the complete reinterpreted assembly — it stands
  // in for the seed entirely (kept cubes render as "preserved", the rest as
  // "added"), so the seed layer is hidden while it's showing.
  const remixReplaced =
    mode === 'remix' && remixResultReplacesSeed && !!encodedCubes && encodedCubes.length > 0;

  const hasEncoded = !editedStandalone && !!encodedCubes && encodedCubes.length > 0;

  // Is the result still sitting in the assembly? Loading a saved state (or
  // editing the cubes away) takes it back out, and the canvas has to follow.
  const placedCubeIds = useMemo(() => new Set(placedCubes.map(c => c.id)), [placedCubes]);
  const resultInAssembly = useMemo(() => {
    if (!encodedCubes || encodedCubes.length === 0) return false;
    return encodedCubes.every(c => !!c.id && placedCubeIds.has(c.id));
  }, [encodedCubes, placedCubeIds]);

  // An encode result is the primary (solid) layer only while it's an unapplied
  // proposal. Once applied it lives in the assembly and stops being its own
  // layer — otherwise loading a different assembly afterwards leaves the stale
  // proposal dominating the canvas while the assembly you just loaded renders
  // as a faint ghost underneath it.
  const proposalPending = hasEncoded && !resultApplied;

  // Applied, and then the assembly moved on. The assembly is the real thing,
  // so it takes the solid layer and the encoding drops to a ghost over it —
  // still there to compare against, no longer pretending to be the composition.
  const proposalOrphaned = hasEncoded && resultApplied && !resultInAssembly;

  // Merge and remix both seed from the builder assembly, so the seed only
  // needs a layer of its own while a proposal is drawn over it — otherwise
  // the assembly layer already draws exactly those cubes.
  const hasSeed =
    !editedStandalone &&
    !remixReplaced &&
    mode !== 'standalone' &&
    proposalPending &&
    seedCubes.length > 0;

  // Cells the seed (or edited assembly) occupies. Encoded cubes were filtered
  // against the seed at encode time, but the result now survives mode
  // switches, so re-filter at render time to never draw two cubes in one cell.
  const seedOccupiedKeys = useMemo(
    () => new Set(seedCubes.map(c => c.position.join(','))),
    [seedCubes]
  );

  // The encode result's own layer, filtered against the seed (the other layer
  // that's solid at encode time). Empty once the result is living in the
  // assembly, which draws it instead.
  const proposalCubes = useMemo(() => {
    if (!encodedCubes || (!proposalPending && !proposalOrphaned)) return [];
    if (remixReplaced) return encodedCubes;
    return encodedCubes.filter(c => !seedOccupiedKeys.has(c.position.join(',')));
  }, [encodedCubes, proposalPending, proposalOrphaned, remixReplaced, seedOccupiedKeys]);

  // Remix: the seed cubes the model threw away. Ghosted on request so "2
  // discarded, taking 5 cuts with them" is something you can actually look at.
  // Claimed out of the assembly layer below rather than drawn on top of it —
  // they're still in the assembly until you apply, and two ghosts in one cell
  // would just z-fight.
  const discardedCubes = useMemo(() => {
    if (!showDiscarded || !remixReplaced || !encodedCubes) return [];
    const { discarded } = remixDecisions(encodedCubes, seedCubes);
    const drawn = new Set(proposalCubes.map(c => c.position.join(',')));
    return discarded.filter(c => !drawn.has(c.position.join(',')));
  }, [showDiscarded, remixReplaced, encodedCubes, seedCubes, proposalCubes]);

  const discardedKeys = useMemo(
    () => new Set(discardedCubes.map(c => c.position.join(','))),
    [discardedCubes]
  );

  // The builder assembly, minus whatever the seed layer already draws (merge's
  // seed IS the builder assembly) and minus anything the discarded layer claims.
  const assemblyBase = useMemo(() => {
    const base = hasSeed
      ? placedCubes.filter(c => !seedOccupiedKeys.has(c.position.join(',')))
      : placedCubes;
    if (discardedKeys.size === 0) return base;
    return base.filter(c => !discardedKeys.has(c.position.join(',')));
  }, [placedCubes, hasSeed, seedOccupiedKeys, discardedKeys]);

  // Exactly one of these two is the solid layer; the other ghosts behind it and
  // yields any cell they share, so nothing ever z-fights. A pending proposal
  // leads (it's the thing being judged); otherwise the assembly does — which is
  // what makes a freshly-loaded saved assembly read as loaded rather than as a
  // faint smudge under a stale preview.
  const assemblyCubes = useMemo(() => {
    if (!proposalPending) return assemblyBase;
    const drawn = new Set(proposalCubes.map(c => c.position.join(',')));
    return assemblyBase.filter(c => !drawn.has(c.position.join(',')));
  }, [proposalPending, assemblyBase, proposalCubes]);

  const visibleEncoded = useMemo(() => {
    if (proposalPending) return proposalCubes;
    const drawn = new Set(assemblyBase.map(c => c.position.join(',')));
    return proposalCubes.filter(c => !drawn.has(c.position.join(',')));
  }, [proposalPending, proposalCubes, assemblyBase]);

  // Ids the current encode result contributed. Used to keep the "added" read
  // on the assembly after Apply — and, just as usefully, to drop it the moment
  // a different assembly is loaded, since none of its ids will match.
  const encodedIds = useMemo(
    () => new Set((encodedCubes ?? []).map(c => c.id).filter(Boolean) as string[]),
    [encodedCubes]
  );

  // Before/after: the proposal a re-encode replaced, ghosted over the current
  // one. Off unless explicitly toggled on in the Encode panel. Yields every
  // cell another layer already draws.
  const previousProposalCubes = useMemo(() => {
    if (!showPreviousProposal || !previousResult) return [];
    const drawn = new Set<string>();
    if (hasSeed) for (const c of seedCubes) drawn.add(c.position.join(','));
    for (const c of assemblyCubes) drawn.add(c.position.join(','));
    for (const c of visibleEncoded) drawn.add(c.position.join(','));
    return previousResult.cubes.filter(c => !drawn.has(c.position.join(',')));
  }, [showPreviousProposal, previousResult, hasSeed, seedCubes, assemblyCubes, visibleEncoded]);

  const allPositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    if (editedStandalone) for (const c of editedVisibleCubes) positions.push(c.position);
    if (hasSeed) for (const c of seedCubes) positions.push(c.position);
    for (const c of visibleEncoded) positions.push(c.position);
    for (const c of assemblyCubes) positions.push(c.position);
    for (const c of discardedCubes) positions.push(c.position);
    for (const c of previousProposalCubes) positions.push(c.position);
    return positions;
  }, [
    editedStandalone,
    editedVisibleCubes,
    hasSeed,
    seedCubes,
    visibleEncoded,
    assemblyCubes,
    discardedCubes,
    previousProposalCubes,
  ]);

  // The build the connection law is checked against: whatever is currently
  // solid on screen. The ghosted layers (discarded cubes, a previous proposal)
  // are history being compared against, not a build to hold to the law.
  const flaggedIds = useMemo(() => {
    const checkable = editedStandalone
      ? toCheckableCubes(editedVisibleCubes)
      : toCheckableCubes([
          ...(hasSeed ? seedCubes : []),
          ...visibleEncoded,
          ...assemblyCubes,
        ]);
    return summarizeConnections(checkable).mismatchCubeIds;
  }, [editedStandalone, editedVisibleCubes, hasSeed, seedCubes, visibleEncoded, assemblyCubes]);

  if (
    !editedStandalone &&
    !hasSeed &&
    visibleEncoded.length === 0 &&
    assemblyCubes.length === 0 &&
    discardedCubes.length === 0 &&
    previousProposalCubes.length === 0
  ) {
    return <SpatialGrid extent={{ minCellX: -1, maxCellX: 1, minCellZ: -1, maxCellZ: 1, levels: 2 }} />;
  }

  return (
    <>
      <SpatialGrid extent={gridExtentFromPositions(allPositions)} />

      {/* Edited standalone assembly — original cubes plus builder additions.
          Additions are drawn with "added" provenance (blue) and can be hidden
          via the show-additions toggle. */}
      {editedStandalone && editedVisibleCubes.map((cube, i) => {
        const variation = CUBE_VARIATIONS.find(v => v.id === cube.variationId);
        if (!variation) return null;
        const isAdded = !encodedPositionKeys.has(cube.position.join(','));
        return (
          <CubeWithCuts
            key={`edited-${cube.id ?? i}`}
            flagged={flaggedIds.has(checkableId(cube))}
            variation={variation}
            position={cube.position}
            rotation={cube.rotation}
            provenance={isAdded ? 'added' : 'preserved'}
          />
        );
      })}

      {/* Seed cubes — only in merge/remix mode */}
      {hasSeed && seedCubes.map((cube, i) => {
        const variation = CUBE_VARIATIONS.find(v => v.id === cube.variationId);
        if (!variation) return null;
        return (
          <CubeWithCuts
            key={`seed-${i}`}
            flagged={flaggedIds.has(checkableId(cube))}
            variation={variation}
            position={cube.position}
            rotation={cube.rotation}
            provenance="preserved"
          />
        );
      })}

      {/* Encoded cubes. In a remix result, cubes that kept their seed
          identity read as "preserved"; new/transformed ones as "added".
          Ghosted instead of solid once the assembly has moved on from this
          result — still comparable, no longer posing as the composition. */}
      {visibleEncoded.map((cube, i) => {
        const variation = CUBE_VARIATIONS.find(v => v.id === cube.variationId);
        if (!variation) return null;
        const kept = remixReplaced && !!cube.id && seedCubeIds.has(cube.id);
        return (
          <CubeWithCuts
            key={`enc-${i}`}
            flagged={flaggedIds.has(checkableId(cube))}
            variation={variation}
            position={cube.position}
            rotation={{
              x: (cube.rotation.x as 0 | 1 | 2 | 3) || 0,
              y: (cube.rotation.y as 0 | 1 | 2 | 3) || 0,
            }}
            opacity={proposalPending ? 1 : 0.45}
            isPreview={!proposalPending}
            ghost={!proposalPending}
            provenance={kept ? 'preserved' : 'added'}
          />
        );
      })}

      {/* The builder assembly. Ghosted behind a pending proposal (bumped from
          0.15 — at that opacity a loaded assembly was easy to miss entirely);
          solid once nothing is competing with it. */}
      {assemblyCubes.map(cube => {
        const variation = CUBE_VARIATIONS.find(v => v.id === cube.variationId);
        if (!variation) return null;
        // Post-apply, cubes the encode contributed keep their "added" read;
        // in a remix result the ones that kept their seed identity read as
        // preserved, matching the proposal layer above.
        const fromEncode =
          !proposalPending && !proposalOrphaned && !!cube.id && encodedIds.has(cube.id);
        const kept = fromEncode && remixResultReplacesSeed && seedCubeIds.has(cube.id);
        return (
          <CubeWithCuts
            key={`assembly-${cube.id}`}
            flagged={flaggedIds.has(checkableId(cube))}
            variation={variation}
            position={cube.position}
            rotation={cube.rotation}
            opacity={proposalPending ? 0.45 : 1}
            isPreview={proposalPending}
            ghost={proposalPending}
            provenance={fromEncode ? (kept ? 'preserved' : 'added') : undefined}
          />
        );
      })}

      {/* Remix: what the model discarded, ghosted so it can be inspected */}
      {discardedCubes.map(cube => {
        const variation = CUBE_VARIATIONS.find(v => v.id === cube.variationId);
        if (!variation) return null;
        return (
          <CubeWithCuts
            key={`discarded-${cube.id}`}
            variation={variation}
            position={cube.position}
            rotation={cube.rotation}
            opacity={0.4}
            isPreview
            ghost
          />
        );
      })}

      {/* Before/after: the proposal this re-encode replaced, ghosted */}
      {previousProposalCubes.map((cube, i) => {
        const variation = CUBE_VARIATIONS.find(v => v.id === cube.variationId);
        if (!variation) return null;
        return (
          <CubeWithCuts
            key={`prev-${cube.id ?? i}`}
            variation={variation}
            position={cube.position}
            rotation={{
              x: (cube.rotation.x as 0 | 1 | 2 | 3) || 0,
              y: (cube.rotation.y as 0 | 1 | 2 | 3) || 0,
            }}
            opacity={0.35}
            isPreview
            ghost
          />
        );
      })}
    </>
  );
};

/**
 * Evolution mode scene — shows assembly with the currently previewed
 * candidate's target cube highlighted in amber.  When a candidate is
 * selected, shows a wireframe preview of the cutter that would be applied.
 * Geometry overrides from previous pataphysical operations are preserved.
 */
const EvolutionScene: React.FC = () => {
  const { accent } = useAccent();
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const cubeGeometryOverrides = useMemeStore(s => s.cubeGeometryOverrides);
  const previewCandidateId = useEvolutionStore(s => s.previewCandidateId);
  const candidates = useEvolutionStore(s => s.candidates);
  const clippingPlanes = useClippingPlanes();

  // Click-to-inspect: selecting a cube surfaces its change record card and
  // restores its stored cutter wireframe (via setTargetCubeId). This scene is
  // shared with Decode mode as a backdrop, so clicks only arm in Evolution.
  const activeMode = useAppStore(s => s.activeMode);
  const inspectable = activeMode === 'evolution';
  const targetCubeId = useMemeStore(s => s.targetCubeId);
  const setTargetCubeId = useMemeStore(s => s.setTargetCubeId);
  const inspectedCube = inspectable
    ? placedCubes.find(c => c.id === targetCubeId)
    : undefined;

  // Find which cube the previewed candidate targets
  const previewedCandidate = candidates.find(c => c.id === previewCandidateId);
  const highlightCubeId = previewedCandidate?.targetCubeId ?? null;
  const previewTargetCube = placedCubes.find(c => c.id === highlightCubeId);

  // Generate a cutter wireframe preview for the selected candidate
  const cutterPreview = useMemo(() => {
    if (!previewedCandidate || !previewTargetCube) return null;
    try {
      return createCutterFromLLMOutput(previewedCandidate.cutterConfig);
    } catch {
      return null;
    }
  }, [previewedCandidate, previewTargetCube]);

  const cutterEdges = useMemo(() => {
    if (!cutterPreview) return null;
    return new THREE.EdgesGeometry(cutterPreview, 1);
  }, [cutterPreview]);

  const flaggedIds = useMemo(
    () => summarizeConnections(toCheckableCubes(placedCubes)).mismatchCubeIds,
    [placedCubes]
  );

  const gridExtent = useMemo(
    () => gridExtentFromPositions(placedCubes.map(c => c.position)),
    [placedCubes]
  );

  return (
    <>
      <SpatialGrid extent={gridExtent} />

      {placedCubes.map(cube => {
        const variation = CUBE_VARIATIONS.find(v => v.id === cube.variationId);
        if (!variation) return null;
        const override = cubeGeometryOverrides[cube.id] || null;
        return (
          <CubeWithCuts
            key={cube.id}
            variation={variation}
            position={cube.position}
            rotation={cube.rotation}
            overrideGeometry={override}
            targeted={cube.id === highlightCubeId}
            selected={inspectable && cube.id === targetCubeId}
            flagged={flaggedIds.has(cube.id)}
            clippingPlanes={clippingPlanes}
            onClick={inspectable
              ? () => setTargetCubeId(cube.id === targetCubeId ? null : cube.id)
              : undefined}
          />
        );
      })}

      {/* Stored cutter wireframe of the inspected cube's last change */}
      {inspectedCube && (
        <group
          position={inspectedCube.position}
          rotation={[
            (inspectedCube.rotation.x * Math.PI) / 2,
            (inspectedCube.rotation.y * Math.PI) / 2,
            0,
          ]}
        >
          <CutterOverlay offset={[-CUBE_SIZE / 2, -CUBE_SIZE / 2, -CUBE_SIZE / 2]} />
        </group>
      )}

      {/* Click-away plane to clear the inspected cube (Evolution mode only) */}
      {inspectable && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(e) => {
            e.stopPropagation();
            setTargetCubeId(null);
          }}
        >
          <planeGeometry args={[500, 500]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}

      {/* Cutter wireframe preview for selected candidate */}
      {previewTargetCube && cutterPreview && cutterEdges && (
        <group
          position={previewTargetCube.position}
          rotation={[
            (previewTargetCube.rotation.x * Math.PI) / 2,
            (previewTargetCube.rotation.y * Math.PI) / 2,
            0,
          ]}
        >
          <mesh geometry={cutterPreview} position={[-CUBE_SIZE / 2, -CUBE_SIZE / 2, -CUBE_SIZE / 2]}>
            <meshBasicMaterial color={accent} transparent opacity={0.1} side={THREE.DoubleSide} />
          </mesh>
          <lineSegments geometry={cutterEdges} position={[-CUBE_SIZE / 2, -CUBE_SIZE / 2, -CUBE_SIZE / 2]}>
            <lineBasicMaterial color={accent} linewidth={1} transparent opacity={0.7} />
          </lineSegments>
        </group>
      )}
    </>
  );
};

/** Registers a screenshot capture function with the module-level ref. */
const SceneCapture: React.FC = () => {
  const { gl, scene, camera, get } = useThree();
  useEffect(() => {
    // Hi-res, background-free capture: the render buffer is transparent (the
    // paper tone is CSS on the canvas element, never drawn by WebGL), so the
    // exported PNG has no background — a diagrammatic cut-out. The buffer is
    // temporarily upscaled for print-quality output, then restored.
    registerCaptureFunction((options) => {
      const requested = options?.scale ?? 3;
      const prevRatio = gl.getPixelRatio();
      const size = gl.getSize(new THREE.Vector2());
      // Clamp so the long edge stays within common GPU buffer limits.
      const maxRatio = 4096 / Math.max(size.x, size.y);
      const ratio = Math.min(requested * prevRatio, maxRatio);
      try {
        gl.setPixelRatio(ratio);
        gl.render(scene, camera);
        // Camera state read at capture time (not effect time) so the stamped
        // provenance matches the exact frame in the file. Controls come from
        // the live R3F store — `camera` from the closure is the active one
        // because CameraController re-sets it on every projection toggle.
        const controls = get().controls as { target?: THREE.Vector3 } | null;
        return {
          dataURL: gl.domElement.toDataURL('image/png'),
          camera: {
            projection: (camera as THREE.Camera & { isOrthographicCamera?: boolean })
              .isOrthographicCamera ? 'orthographic' as const : 'perspective' as const,
            position: camera.position.toArray() as [number, number, number],
            target: controls?.target
              ? (controls.target.toArray() as [number, number, number])
              : null,
            zoom: (camera as THREE.PerspectiveCamera | THREE.OrthographicCamera).zoom,
          },
        };
      } finally {
        gl.setPixelRatio(prevRatio);
        gl.render(scene, camera);
      }
    });
    return () => unregisterCaptureFunction();
  }, [gl, scene, camera, get]);
  return null;
};

export const Viewport3D: React.FC = () => {
  const activeMode       = useAppStore(s => s.activeMode);
  const seedEditOpen     = useEncodingStore(s => s.seedEditOpen);
  const evolutionSubMode = useEvolutionStore(s => s.subMode);

  // Encoding: Builder takes over the scene when the seed-edit overlay is open.
  // Evolution: Pataphysical takes over the scene when its sub-mode is active.
  const showBuilderScene       = activeMode === 'encoding' && seedEditOpen;
  const showEncodingScene      = activeMode === 'encoding' && !seedEditOpen;
  const showPataphysicalScene  = activeMode === 'evolution' && evolutionSubMode === 'pataphysical';
  const showEvolutionScene     =
    (activeMode === 'evolution' && evolutionSubMode === 'evolve') ||
    activeMode === 'decode';

  return (
    <>
      <Canvas
        style={{ background: '#f7f5f0' }}
        gl={{ localClippingEnabled: true, preserveDrawingBuffer: true }}
      >
        <CameraController
          showBuilderScene={showBuilderScene}
          showEncodingScene={showEncodingScene}
          showPataphysicalScene={showPataphysicalScene}
          showEvolutionScene={showEvolutionScene}
        />
        <SceneCapture />
        {/* Endless drafting-table ground: an infinite faded grid so the scene
            never ends at the assembly's edge. The denser SpatialGrid lattice
            still marks the buildable cells on top of it. fadeDistance must stay
            well inside the cameras' far planes (CameraController / cameraUtils),
            or the grid gets frustum-clipped before the shader fade completes
            and reads as "the grid disappeared". */}
        <Grid
          position={[0, -0.6, 0]}
          infiniteGrid
          cellSize={GRID_STRIDE}
          sectionSize={GRID_STRIDE * 4}
          cellThickness={0.9}
          sectionThickness={1.2}
          cellColor="#c5c0b1"
          sectionColor="#aaa494"
          fadeDistance={16000}
          fadeStrength={1}
          followCamera={false}
        />
        <ambientLight intensity={0.6} />
        <directionalLight position={[50, 50, 50]} intensity={0.8} />
        <ViewportControls
          showBuilderScene={showBuilderScene}
          showEncodingScene={showEncodingScene}
          showPataphysicalScene={showPataphysicalScene}
          showEvolutionScene={showEvolutionScene}
        />
        {/* Selecting a candidate or clicking a cube glides the camera to it —
            only in Evolution mode (Decode shares the scene as a backdrop). */}
        <ZoomToCube active={activeMode === 'evolution'} />

        {showBuilderScene       && <BuilderScene />}
        {showEncodingScene      && <EncodingScene />}
        {showPataphysicalScene  && <PataphysicalScene />}
        {showEvolutionScene     && <EvolutionScene />}
      </Canvas>
      <ViewportCameraToggle />
    </>
  );
};
