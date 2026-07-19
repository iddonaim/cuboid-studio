import { test, expect } from '@playwright/test';

/**
 * Offline demo — whole-circle first pass
 * (see docs/internal/offline-demo-first-pass.md)
 *
 * Question under test: with EVERY external request killed at the routing
 * layer, does `?demo` boot straight onto the sites map, plot the bundled
 * pins, list the bundled compositions, and restore one end-to-end through
 * the real `restoreComposition` path (GLB + local DRACO decode included)?
 *
 * The bundle itself is fulfilled from an in-test fixture so the repo needs
 * no committed placeholder data — the real bundle is produced by the export
 * flow (?demoExport → scripts/build-demo-bundle.mjs).
 */

const DEMO_PIN = {
  projectId: 'proj-demo',
  projectName: 'Thesis',
  siteId: 'site-demo',
  siteName: 'Demo Site',
  lat: 32.08,
  lng: 34.78,
  address: 'Tel Aviv',
  radiusMeters: 500,
  siteContext: null,
  createdAt: 1750000000000,
};

const OPERATOR_RECORD = {
  id: 'op-demo-1',
  source: 'meme',
  operator: 'erosion',
  targets: ['adjacency'],
  magnitude: 0.6,
  decay: 0.4,
  createdAt: '2026-07-01T00:00:00.000Z',
  memeDescription: 'Demo meme: the balcony and the tree',
  reasoning: 'Fixture operator for the offline demo gate.',
  cutter: {
    type: 'sphere',
    proportions: [0.5, 0.5, 0.5],
    position: [0.2, 0.1, -0.3],
    rotation: [0, 0, 0],
  },
  memeTitle: 'Demo meme',
  memeImageUrl: 'https://firebasestorage.example.com/demo.jpg',
};

const COMPOSITION_DATA = {
  builderAssembly: {
    placedCubes: [
      { id: 'cube-demo-1', variationId: 'v-00', position: [0, 0, 0], rotation: { x: 0, y: 0 } },
    ],
    selectedIdx: 0,
    rulesEnabled: true,
    strictRulesEnabled: false,
  },
  encode: null,
  pataphysical: {
    memeDescription: 'Demo meme: the balcony and the tree',
    locationTag: 'Tel Aviv',
    engagementLevel: 50,
    selectedMemeImageUrl: 'https://firebasestorage.example.com/demo.jpg',
    selectedMemeTitle: 'Demo meme',
    baseVariationId: 'v-00',
    targetCubeId: 'cube-demo-1',
    passMode: 'two_pass',
    operators: [],
    cubeOperators: { 'cube-demo-1': [OPERATOR_RECORD] },
    lastPass1: null,
    lastPass2: null,
    lastConfidenceVector: null,
    lastModel: null,
  },
  evolution: {
    subMode: 'pataphysical',
    generation: 0,
    candidates: [],
    compressibilityLog: [],
    config: {
      populationSize: 6,
      selectionPressure: 0.7,
      targetCubeStrategy: 'adaptive',
      memePoolFilter: null,
    },
    baselineScore: null,
    lastAppliedCubeId: null,
  },
  decode: { canvasTiles: [], freestyle: false },
  siteContextSnapshot: null,
};

const DEMO_BUNDLE = {
  version: 1,
  exportedAt: '2026-07-01T00:00:00.000Z',
  pins: [DEMO_PIN],
  compositions: [
    {
      projectId: 'proj-demo',
      siteId: 'site-demo',
      doc: {
        id: 'comp-demo-1',
        name: 'full-circle-fixture',
        createdAt: 1750000000000,
        updatedAt: 1750000000000,
        data: COMPOSITION_DATA,
      },
    },
  ],
  memes: [],
  translations: [],
  images: { 'https://firebasestorage.example.com/demo.jpg': '/demo/memes/img-000.jpg' },
};

// 1×1 transparent PNG for tile/meme-image fulfilment.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test('offline demo: map → pins → composition restore, all external network dead', async ({ page, context }, testInfo) => {
  const attempted: string[] = [];

  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return route.continue();
    }
    attempted.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort('connectionfailed');
  });

  // The bundle + its assets, as the built app would serve them from /demo/.
  await page.route('**/demo/bundle.json', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(DEMO_BUNDLE) }),
  );
  await page.route('**/demo/tiles/**', route =>
    route.fulfill({ contentType: 'image/png', body: TINY_PNG }),
  );
  await page.route('**/demo/memes/**', route =>
    route.fulfill({ contentType: 'image/png', body: TINY_PNG }),
  );

  await page.addInitScript(() => {
    window.localStorage.setItem('cs-onboarding-seen', '1');
  });

  // 1 — Boot straight onto the sites map, no auth, no network.
  await page.goto('/?demo');
  const marker = page.locator('.leaflet-marker-pane .leaflet-marker-icon');
  await expect(marker).toHaveCount(1, { timeout: 15_000 });

  // 2 — Pin click opens the site card with the bundled composition.
  await marker.click();
  // (the pin tooltip also says "Demo Site" — target the site card's title)
  await expect(page.locator('div.font-semibold', { hasText: 'Demo Site' })).toBeVisible();
  await expect(page.getByText('full-circle-fixture')).toBeVisible();

  // 3 — Load it through the real confirm flow.
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Load anyway' }).click();

  // 4 — The full restore (operator replay incl. GLB + local DRACO decode)
  //     completes and lands in Encode mode.
  await expect(page.getByText('Composition loaded')).toBeVisible({ timeout: 20_000 });

  await testInfo.attach('blocked-external-requests', {
    body: [...new Set(attempted)].sort().join('\n') || '(none)',
    contentType: 'text/plain',
  });
});
