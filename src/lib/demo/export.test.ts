import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SitePin } from '../projects/sitePins';
import type { CompositionDoc } from '../projects/types';

vi.mock('../projects/sitePins', () => ({
  loadSitePins: vi.fn(),
  isLocated: (p: SitePin) => p.lat !== null && p.lng !== null,
}));
vi.mock('../projects/firestore', () => ({ listCompositions: vi.fn() }));
vi.mock('../projects/photoStorage', () => ({ getFileUrl: vi.fn() }));
vi.mock('./recorder', () => ({ getRecording: () => null }));

import { buildRawDemoBundle } from './export';
import { loadSitePins } from '../projects/sitePins';
import { listCompositions } from '../projects/firestore';
import { getFileUrl } from '../projects/photoStorage';

function makePin(overrides: Partial<SitePin> = {}): SitePin {
  return {
    projectId: 'proj-1',
    projectName: 'Project',
    siteId: 'site-1',
    siteName: 'Site',
    lat: 32.07,
    lng: 34.8,
    address: 'somewhere',
    radiusMeters: 300,
    siteContext: null,
    createdAt: 0,
    ...overrides,
  };
}

function makeComposition(overrides: {
  encodeImagePaths?: string[];
  capturePaths?: string[];
} = {}): CompositionDoc {
  return {
    id: 'comp-1',
    name: 'Composition',
    createdAt: 0,
    updatedAt: 0,
    data: {
      builderAssembly: { placedCubes: [], selectedIdx: -1, rulesEnabled: true, strictRulesEnabled: true },
      encode: {
        encodedCubes: null,
        encodingReasoning: null,
        mode: 'standalone',
        seedCubes: [],
        images: (overrides.encodeImagePaths ?? []).map((storagePath, i) => ({
          id: `img-${i}`,
          thumbnailDataUrl: 'data:image/jpeg;base64,AAA',
          isPrimary: i === 0,
          storagePath,
        })),
      },
      pataphysical: {
        memeDescription: '',
        locationTag: '',
        engagementLevel: 0,
        selectedMemeImageUrl: null,
        selectedMemeTitle: null,
        baseVariationId: 'v-00',
        targetCubeId: null,
        passMode: 'single',
        operators: [],
        cubeOperators: {},
        lastPass1: null,
        lastPass2: null,
        lastConfidenceVector: null,
        lastModel: null,
      },
      evolution: {
        subMode: 'evolve',
        generation: 0,
        candidates: [],
        compressibilityLog: [],
        config: {} as never,
        baselineScore: null,
        lastAppliedCubeId: null,
      },
      decode: { canvasTiles: [], freestyle: false },
      siteContextSnapshot: null,
      captures: (overrides.capturePaths ?? []).map((storagePath, i) => ({
        id: `cap-${i}`,
        storagePath,
        thumbnailDataUrl: 'data:image/png;base64,AAA',
        createdAt: 0,
        projection: 'perspective' as const,
        section: null,
      })),
    },
  };
}

describe('buildRawDemoBundle — fullResUrls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
  });

  it('resolves a download URL for every encode-photo and capture storage path', async () => {
    vi.mocked(loadSitePins).mockResolvedValue([makePin()]);
    vi.mocked(listCompositions).mockResolvedValue([
      makeComposition({ encodeImagePaths: ['owner/photos/a.jpg'], capturePaths: ['owner/captures/b.png'] }),
    ]);
    vi.mocked(getFileUrl).mockImplementation(async path => `https://storage.example/${path}?token=x`);

    const bundle = await buildRawDemoBundle('owner');

    expect(bundle.fullResUrls).toEqual({
      'owner/photos/a.jpg': 'https://storage.example/owner/photos/a.jpg?token=x',
      'owner/captures/b.png': 'https://storage.example/owner/captures/b.png?token=x',
    });
  });

  it('drops a path whose resolution fails instead of throwing', async () => {
    vi.mocked(loadSitePins).mockResolvedValue([makePin()]);
    vi.mocked(listCompositions).mockResolvedValue([
      makeComposition({ encodeImagePaths: ['owner/photos/gone.jpg', 'owner/photos/ok.jpg'] }),
    ]);
    vi.mocked(getFileUrl).mockImplementation(async path =>
      path.includes('gone') ? null : `https://storage.example/${path}`,
    );

    const bundle = await buildRawDemoBundle('owner');

    expect(bundle.fullResUrls).toEqual({
      'owner/photos/ok.jpg': 'https://storage.example/owner/photos/ok.jpg',
    });
  });

  it('is an empty object when no composition has a photo or capture', async () => {
    vi.mocked(loadSitePins).mockResolvedValue([makePin()]);
    vi.mocked(listCompositions).mockResolvedValue([makeComposition()]);

    const bundle = await buildRawDemoBundle('owner');

    expect(bundle.fullResUrls).toEqual({});
    expect(getFileUrl).not.toHaveBeenCalled();
  });
});
