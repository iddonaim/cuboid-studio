import { describe, it, expect } from 'vitest';
import { variation2dPath } from './variation2dPath';

describe('variation2dPath', () => {
  it('builds the public SVG path for a variation id', () => {
    expect(variation2dPath('v-00')).toBe('/2d/v-00.svg');
    expect(variation2dPath('v-69')).toBe('/2d/v-69.svg');
  });
});
