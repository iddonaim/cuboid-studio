import { describe, it, expect } from 'vitest';
import { shortSiteName } from './siteName';
import type { SiteContextData } from '../storage/siteContext';

function ctx(address: string, siteName = 'Fallback name'): SiteContextData {
  return {
    site_name: siteName,
    generated: '2026-07-30T00:00:00.000Z',
    quantitative: {
      location: { lat: '32.08', lng: '34.77', address },
      sun: { primary_exposure: '', shadow_hours_winter: '', shadow_hours_summer: '' },
      wind: { dominant_direction: '', intensity: '' },
      transit: { walkability_notes: '', bus_stops_nearby: '', primary_mode: '' },
      morphology: {
        typology: '', street_width: '', dominant_height: '',
        lot_dimensions: '', topography: '', dominant_directionality: '',
      },
    },
    programmatic: { existing_uses: [], historical_uses: [] },
  };
}

describe('shortSiteName', () => {
  it('folds a leading house number into the street and appends the locality', () => {
    expect(
      shortSiteName(ctx('100, Dizengoff Street, Tel Aviv-Yafo, Tel Aviv District, 6433222, Israel')),
    ).toBe('Dizengoff Street 100, Tel Aviv-Yafo');
  });

  it('uses the first segment as-is when it is not a bare number', () => {
    expect(
      shortSiteName(ctx('Dizengoff Center, Tel Aviv-Yafo, Israel')),
    ).toBe('Dizengoff Center, Tel Aviv-Yafo');
  });

  it('skips digit-bearing segments (postal codes) when picking the locality', () => {
    expect(shortSiteName(ctx('Main Street, 90210, Beverly Hills, USA'))).toBe(
      'Main Street, Beverly Hills',
    );
  });

  it('returns just the street when no locality segment exists', () => {
    expect(shortSiteName(ctx('Rothschild Boulevard'))).toBe('Rothschild Boulevard');
  });

  it('falls back to site_name when the address is empty', () => {
    expect(shortSiteName(ctx(''))).toBe('Fallback name');
  });

  it('returns empty string for a null context', () => {
    expect(shortSiteName(null)).toBe('');
  });
});
