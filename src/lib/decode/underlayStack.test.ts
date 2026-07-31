import { describe, it, expect, beforeEach } from 'vitest';
import { useDecodeStore, MAX_UNDERLAYS, type DecodeUnderlay } from '../../store/useDecodeStore';
import { snapRotation, ROTATION_SNAP_THRESHOLD } from './rotationSnap';

function layer(over: Partial<DecodeUnderlay> = {}): DecodeUnderlay {
  return {
    id: crypto.randomUUID(),
    source: 'plan',
    label: 'Plan',
    visible: true,
    opacity: 1,
    dataUrl: 'data:image/png;base64,AAA',
    thumbnailDataUrl: 'data:image/png;base64,BBB',
    imageHash: 'hash',
    width: 100,
    height: 80,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    scale: 1,
    ...over,
  };
}

describe('underlay stack', () => {
  beforeEach(() => {
    useDecodeStore.setState({ underlays: [], armedUnderlayId: null });
  });

  it('adds to the top of the stack and arms the new layer', () => {
    const first = layer({ label: 'Plan' });
    const second = layer({ label: 'Capture', source: 'capture' });
    useDecodeStore.getState().addUnderlay(first);
    useDecodeStore.getState().addUnderlay(second);

    const { underlays, armedUnderlayId } = useDecodeStore.getState();
    expect(underlays.map(u => u.label)).toEqual(['Capture', 'Plan']);
    expect(armedUnderlayId).toBe(second.id);
  });

  it('refuses to grow past the cap rather than dropping a layer', () => {
    for (let i = 0; i < MAX_UNDERLAYS + 2; i++) {
      useDecodeStore.getState().addUnderlay(layer({ label: `L${i}` }));
    }
    expect(useDecodeStore.getState().underlays).toHaveLength(MAX_UNDERLAYS);
    // The earliest layers survive; the overflow is refused, not rotated out.
    expect(useDecodeStore.getState().underlays.map(u => u.label)).toEqual(
      ['L3', 'L2', 'L1', 'L0'],
    );
  });

  it('reorders within bounds and ignores moves off either end', () => {
    const a = layer({ label: 'A' });
    const b = layer({ label: 'B' });
    useDecodeStore.setState({ underlays: [a, b] });

    useDecodeStore.getState().moveUnderlay(a.id, 1);
    expect(useDecodeStore.getState().underlays.map(u => u.label)).toEqual(['B', 'A']);

    // 'B' is already top; moving it up again is a no-op rather than an error.
    useDecodeStore.getState().moveUnderlay(b.id, -1);
    expect(useDecodeStore.getState().underlays.map(u => u.label)).toEqual(['B', 'A']);
  });

  it('disarms a layer when it is hidden — handles must not float over nothing', () => {
    const a = layer();
    useDecodeStore.setState({ underlays: [a], armedUnderlayId: a.id });
    useDecodeStore.getState().toggleUnderlayVisible(a.id);
    expect(useDecodeStore.getState().underlays[0].visible).toBe(false);
    expect(useDecodeStore.getState().armedUnderlayId).toBeNull();
  });

  it('disarms a layer when it is removed', () => {
    const a = layer();
    useDecodeStore.setState({ underlays: [a], armedUnderlayId: a.id });
    useDecodeStore.getState().removeUnderlay(a.id);
    expect(useDecodeStore.getState().underlays).toEqual([]);
    expect(useDecodeStore.getState().armedUnderlayId).toBeNull();
  });

  it('clamps opacity and edits registration on one layer only', () => {
    const a = layer({ label: 'A' });
    const b = layer({ label: 'B' });
    useDecodeStore.setState({ underlays: [a, b] });

    useDecodeStore.getState().setUnderlayOpacity(a.id, 2);
    useDecodeStore.getState().updateUnderlayRegistration(a.id, { offsetX: 40, rotation: 12 });

    const [first, second] = useDecodeStore.getState().underlays;
    expect(first.opacity).toBe(1);
    expect(first.offsetX).toBe(40);
    expect(first.rotation).toBe(12);
    expect(second.offsetX).toBe(0);
    expect(second.rotation).toBe(0);
  });
});

describe('snapRotation', () => {
  it('latches onto a mark once rotation arrives near it', () => {
    expect(snapRotation(44)).toBe(45);
    expect(snapRotation(1)).toBe(0);
    expect(snapRotation(89)).toBe(90);
  });

  it('leaves angles between the marks alone — magnetic, not stepped', () => {
    expect(snapRotation(7)).toBe(7);
    expect(snapRotation(37)).toBe(37);
    expect(snapRotation(52)).toBe(52);
  });

  it('snaps exactly at the threshold and not beyond it', () => {
    expect(snapRotation(15 + ROTATION_SNAP_THRESHOLD)).toBe(15);
    expect(snapRotation(15 + ROTATION_SNAP_THRESHOLD + 0.5)).toBe(15 + ROTATION_SNAP_THRESHOLD + 0.5);
  });

  it('does nothing at all when suppressed', () => {
    expect(snapRotation(44, true)).toBe(44);
    expect(snapRotation(90, true)).toBe(90);
  });
});
