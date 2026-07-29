import { describe, it, expect, beforeEach } from 'vitest';
import { useBuilderStore } from './useBuilderStore';
import {
  VARIATION_FACE_TYPES,
  getRotatedFaceCutType,
  getAllRotations,
  type Rotation,
} from '../lib/cube/connectionRules';
import { CUBE_VARIATIONS } from '../lib/cube/specifications';
import { GRID_STRIDE } from '../lib/cube/constants';

/** A variation + a placed neighbour such that SOME rotations are legal and
 *  some are not — the case where rotating should visibly matter. */
function findMixedCase() {
  for (const neighbour of CUBE_VARIATIONS) {
    const nFaces = VARIATION_FACE_TYPES.get(neighbour.id)!;
    const neighbourXPos = nFaces.X_POS;
    if (neighbourXPos === 'shell') continue;

    for (const picked of CUBE_VARIATIONS) {
      const pFaces = VARIATION_FACE_TYPES.get(picked.id)!;
      const legal: Rotation[] = [];
      const illegal: Rotation[] = [];
      for (const r of getAllRotations()) {
        const t = getRotatedFaceCutType(pFaces, 'X_NEG', r);
        (t === neighbourXPos ? legal : illegal).push(r);
      }
      if (legal.length > 0 && illegal.length > 0) {
        return { neighbour, picked, legal, illegal };
      }
    }
  }
  throw new Error('no mixed case in the vocabulary');
}

describe('placement validity vs the rotation the user chose', () => {
  beforeEach(() => {
    useBuilderStore.setState({
      placedCubes: [],
      hoverPos: null,
      rulesEnabled: true,
      strictRulesEnabled: false,
    });
  });

  it('has variations where some rotations fit a neighbour and others do not', () => {
    const { legal, illegal } = findMixedCase();
    expect(legal.length).toBeGreaterThan(0);
    expect(illegal.length).toBeGreaterThan(0);
  });

  it('reports the user-chosen rotation honestly, red when it does not fit', () => {
    const { neighbour, picked, legal, illegal } = findMixedCase();

    useBuilderStore.setState({
      placedCubes: [
        { id: 'n', variationId: neighbour.id, position: [0, 21, 0], rotation: { y: 0, x: 0 } },
      ],
      hoverPos: [GRID_STRIDE, 21, 0],
      selectedIdx: CUBE_VARIATIONS.findIndex(v => v.id === picked.id),
      rulesEnabled: true,
      strictRulesEnabled: false,
    });

    // A rotation that fits: green, and shown as chosen.
    useBuilderStore.setState({ previewRotation: legal[0] });
    const good = useBuilderStore.getState().getPlacementValidity();
    expect(good.valid).toBe(true);
    expect(good.rotation).toEqual(legal[0]);

    // A rotation that does NOT fit: must read as invalid, and must still show
    // the rotation the user actually chose rather than silently substituting a
    // different one. Otherwise turning the cube can never change the verdict
    // and the rotations stop representing real options.
    useBuilderStore.setState({ previewRotation: illegal[0] });
    const bad = useBuilderStore.getState().getPlacementValidity();
    expect(bad.valid).toBe(false);
    expect(bad.rotation).toEqual(illegal[0]);
  });
});

describe('arriving at a cell suggests a rotation that fits', () => {
  it('snaps to a fitting rotation on a new cell, then leaves the choice alone', () => {
    const { neighbour, picked, legal, illegal } = findMixedCase();

    useBuilderStore.setState({
      placedCubes: [
        { id: 'n', variationId: neighbour.id, position: [0, 21, 0], rotation: { y: 0, x: 0 } },
      ],
      hoverPos: null,
      selectedIdx: CUBE_VARIATIONS.findIndex(v => v.id === picked.id),
      previewRotation: illegal[0],
      rulesEnabled: true,
      strictRulesEnabled: false,
    });

    // Arriving at the cell with a rotation that doesn't fit: offered one that does.
    useBuilderStore.getState().setHoverPos([GRID_STRIDE, 21, 0]);
    const afterArrival = useBuilderStore.getState();
    expect(afterArrival.getPlacementValidity().valid).toBe(true);

    // Deliberately turning to one that doesn't fit is respected, not overridden.
    useBuilderStore.setState({ previewRotation: illegal[0] });
    useBuilderStore.getState().setHoverPos([GRID_STRIDE, 21, 0]); // same cell
    expect(useBuilderStore.getState().previewRotation).toEqual(illegal[0]);
    expect(useBuilderStore.getState().getPlacementValidity().valid).toBe(false);
  });

  it('never places a cube in a rotation the rules refuse', () => {
    const { neighbour, picked, illegal } = findMixedCase();
    useBuilderStore.setState({
      placedCubes: [
        { id: 'n', variationId: neighbour.id, position: [0, 21, 0], rotation: { y: 0, x: 0 } },
      ],
      hoverPos: [GRID_STRIDE, 21, 0],
      selectedIdx: CUBE_VARIATIONS.findIndex(v => v.id === picked.id),
      previewRotation: illegal[0],
      rulesEnabled: true,
      strictRulesEnabled: false,
    });
    useBuilderStore.getState().handlePlace();
    expect(useBuilderStore.getState().placedCubes).toHaveLength(1);
  });
});
