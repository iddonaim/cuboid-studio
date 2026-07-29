import { describe, it, expect } from 'vitest';
import { toSitePin, isLocated } from './sitePins';
import type { ProjectDoc, SiteDoc } from './types';
import type { SiteContextData } from '../storage/siteContext';

const project: ProjectDoc = {
  id: 'p1',
  name: 'Thesis',
  ownerId: 'u1',
  createdAt: 1,
  updatedAt: 2,
};

function makeContext(loc: Partial<SiteContextData['quantitative']['location']>): SiteContextData {
  return {
    site_name: 'Test site',
    generated: '2026-01-01T00:00:00.000Z',
    quantitative: {
      location: { lat: '', lng: '', address: '', ...loc },
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

function makeSite(siteContext: SiteContextData | null): SiteDoc {
  return { id: 's1', name: 'Neve Tzedek', createdAt: 3, siteContext };
}

describe('toSitePin', () => {
  it('parses coordinates and radius from a full site context', () => {
    const site = makeSite(
      makeContext({ lat: '32.058140', lng: '34.764860', address: 'HaMered 25, Tel Aviv', radius_meters: '750' }),
    );
    const pin = toSitePin(project, site);
    expect(pin.lat).toBeCloseTo(32.05814);
    expect(pin.lng).toBeCloseTo(34.76486);
    expect(pin.address).toBe('HaMered 25, Tel Aviv');
    expect(pin.radiusMeters).toBe(750);
    expect(pin.projectName).toBe('Thesis');
    expect(pin.siteName).toBe('Neve Tzedek');
    expect(isLocated(pin)).toBe(true);
  });

  it('treats a site with no context as unlocated', () => {
    const pin = toSitePin(project, makeSite(null));
    expect(pin.lat).toBeNull();
    expect(pin.lng).toBeNull();
    expect(isLocated(pin)).toBe(false);
    expect(pin.siteContext).toBeNull();
  });

  it('treats unparseable coordinates as unlocated', () => {
    const pin = toSitePin(project, makeSite(makeContext({ lat: '', lng: 'not-a-number' })));
    expect(isLocated(pin)).toBe(false);
  });

  it('requires both coordinates — one alone is not a location', () => {
    const pin = toSitePin(project, makeSite(makeContext({ lat: '32.05', lng: '' })));
    expect(isLocated(pin)).toBe(false);
  });

  it('falls back to the default radius when radius_meters is absent or invalid', () => {
    const pin = toSitePin(project, makeSite(makeContext({ lat: '32.05', lng: '34.76' })));
    expect(pin.radiusMeters).toBe(500);
  });
});
