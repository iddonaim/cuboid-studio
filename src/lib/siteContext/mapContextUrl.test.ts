import { describe, it, expect } from 'vitest';
import { buildMapContextSrc, siteKeyFromContext, isSameSite } from './mapContextUrl';
import { SiteContextData } from '../storage/siteContext';

const BASE = 'https://map-context-production.up.railway.app';

function contextAt(
  lat: string,
  lng: string,
  address = 'Dizengoff Street 100, Tel Aviv',
  radius: string | null = '400'
): SiteContextData {
  return {
    site_name: 'Test site',
    generated: '2026-07-19T00:00:00.000Z',
    quantitative: {
      location: { lat, lng, address, ...(radius !== null ? { radius_meters: radius } : {}) },
      sun: { primary_exposure: '', shadow_hours_winter: '', shadow_hours_summer: '' },
      wind: { dominant_direction: '', intensity: '' },
      transit: { walkability_notes: '', bus_stops_nearby: '', primary_mode: '' },
      morphology: {
        typology: '',
        street_width: '',
        dominant_height: '',
        lot_dimensions: '',
        topography: '',
        dominant_directionality: '',
      },
    },
    programmatic: { existing_uses: [], historical_uses: [] },
  };
}

describe('buildMapContextSrc', () => {
  it('returns the plain base URL when there is no context', () => {
    expect(buildMapContextSrc(BASE, null)).toBe(BASE);
  });

  it('returns the plain base URL when the context has no coordinates', () => {
    expect(buildMapContextSrc(BASE, contextAt('', ''))).toBe(BASE);
  });

  it('appends lat/lon/address/r for a located context', () => {
    const src = buildMapContextSrc(BASE, contextAt('32.078400', '34.774300'));
    const url = new URL(src);
    expect(url.origin).toBe(BASE);
    expect(url.searchParams.get('lat')).toBe('32.078400');
    expect(url.searchParams.get('lon')).toBe('34.774300');
    expect(url.searchParams.get('address')).toBe('Dizengoff Street 100, Tel Aviv');
    expect(url.searchParams.get('r')).toBe('400');
  });

  it('omits r when radius is missing and omits address when empty', () => {
    const src = buildMapContextSrc(BASE, contextAt('32.078400', '34.774300', '', null));
    const url = new URL(src);
    expect(url.searchParams.get('lat')).toBe('32.078400');
    expect(url.searchParams.has('r')).toBe(false);
    expect(url.searchParams.has('address')).toBe(false);
  });

  it('rejects non-numeric coordinates', () => {
    expect(buildMapContextSrc(BASE, contextAt('not-a-number', '34.77'))).toBe(BASE);
  });
});

describe('siteKeyFromContext', () => {
  it('is null for null context or missing coordinates', () => {
    expect(siteKeyFromContext(null)).toBeNull();
    expect(siteKeyFromContext(contextAt('', ''))).toBeNull();
  });

  it('rounds coordinates so tiny drift maps to the same site', () => {
    const a = siteKeyFromContext(contextAt('32.078401', '34.774299'));
    const b = siteKeyFromContext(contextAt('32.078423', '34.774312'));
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  it('differs for genuinely different coordinates or radius', () => {
    const base = siteKeyFromContext(contextAt('32.078400', '34.774300'));
    expect(siteKeyFromContext(contextAt('32.081000', '34.774300'))).not.toBe(base);
    expect(siteKeyFromContext(contextAt('32.078400', '34.774300', 'x', '800'))).not.toBe(base);
  });

  it('treats a missing radius as the 400 m default', () => {
    expect(siteKeyFromContext(contextAt('32.078400', '34.774300', 'x', null))).toBe(
      siteKeyFromContext(contextAt('32.078400', '34.774300', 'x', '400'))
    );
  });
});

describe('isSameSite', () => {
  it('true for matching sites', () => {
    expect(isSameSite(contextAt('32.078400', '34.774300'), contextAt('32.078410', '34.774310'))).toBe(true);
  });

  it('false when either side is unlocated — an unlocated pair is never "the same site"', () => {
    expect(isSameSite(null, null)).toBe(false);
    expect(isSameSite(contextAt('32.0784', '34.7743'), null)).toBe(false);
    expect(isSameSite(contextAt('', ''), contextAt('', ''))).toBe(false);
  });

  it('false for different sites', () => {
    expect(isSameSite(contextAt('32.0784', '34.7743'), contextAt('31.7683', '35.2137'))).toBe(false);
  });
});
