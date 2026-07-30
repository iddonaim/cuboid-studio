import { describe, it, expect, beforeEach } from 'vitest';
import { useBuilderStore } from './useBuilderStore';
import { GRID_STRIDE } from '../lib/cube/constants';

/**
 * The placement verdict must be honest about a cell that already holds a cube.
 *
 * The rules cannot notice the occupant on their own: the adjacency walk only
 * sees neighbours one cell away, and a cube in the hovered cell itself is at
 * distance zero — invisible. Hovering an occupied cell is reachable whenever
 * the pointer ray slips through a cube's opening and lands on the ground plane
 * behind it: the snapped ground cell can be exactly the cell that cube stands
 * in. `handlePlace` always refused the click; the ghost used to draw green.
 */
describe('placement validity on an occupied cell', () => {
  beforeEach(() => {
    useBuilderStore.setState({
      placedCubes: [
        {
          id: 'occupant',
          variationId: 'v-33',
          position: [0, 21, 0],
          rotation: { y: 0, x: 0 },
        },
      ],
      rulesEnabled: true,
      strictRulesEnabled: false,
      previewRotation: { y: 0, x: 0 },
    });
  });

  it('is invalid when the hovered cell already holds a cube', () => {
    useBuilderStore.setState({ hoverPos: [0, 21, 0] });
    expect(useBuilderStore.getState().getPlacementValidity().valid).toBe(false);
  });

  it('is invalid on an occupied cell even with the rules off', () => {
    // A click there is refused regardless of the rules toggle, so the
    // verdict must not soften when the toggle is off.
    useBuilderStore.setState({ hoverPos: [0, 21, 0], rulesEnabled: false });
    expect(useBuilderStore.getState().getPlacementValidity().valid).toBe(false);
  });

  it('still judges a free neighbouring cell by the rules', () => {
    // The cell beside the occupant is genuinely free; whatever the verdict,
    // it must come from the rotation check, not the occupancy guard.
    useBuilderStore.setState({ hoverPos: [GRID_STRIDE, 21, 0] });
    const { valid, rotation } = useBuilderStore.getState().getPlacementValidity();
    expect(typeof valid).toBe('boolean');
    expect(rotation).toEqual({ y: 0, x: 0 });
    const fits = useBuilderStore
      .getState()
      .getValidRotations()
      .some(r => r.y === 0 && r.x === 0);
    expect(valid).toBe(fits);
  });
});
