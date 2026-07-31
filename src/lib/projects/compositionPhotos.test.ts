import { describe, it, expect, beforeEach, vi } from 'vitest';

// Storage is mocked: these tests are about which photos get uploaded and what
// the snapshot ends up pointing at, not about Firebase itself.
const uploadPhoto = vi.fn();
vi.mock('./photoStorage', () => ({
  uploadPhoto: (...args: unknown[]) => uploadPhoto(...args),
  fetchPhoto: vi.fn(),
  deletePhotos: vi.fn(),
  isPhotoStorageAvailable: () => true,
}));

import { persistCompositionPhotos, compositionPhotoPaths } from './composition';
import { useEncodingStore } from '../../store/useEncodingStore';
import type { CompositionData } from './types';

function snapshotWith(
  images: Array<{ id: string; thumbnailDataUrl: string; isPrimary: boolean; storagePath?: string }>,
): CompositionData {
  return {
    builderAssembly: { placedCubes: [], selectedIdx: 0, rulesEnabled: true, strictRulesEnabled: false },
    encode: {
      encodedCubes: null,
      encodingReasoning: null,
      mode: 'standalone',
      seedCubes: [],
      images,
    },
    pataphysical: {
      memeDescription: '', locationTag: '', engagementLevel: 50,
      selectedMemeImageUrl: null, selectedMemeTitle: null,
      baseVariationId: 'v-00', targetCubeId: null, passMode: 'two_pass',
      operators: [], cubeOperators: [],
      lastPass1: null, lastPass2: null, lastConfidenceVector: null, lastModel: null,
    } as unknown as CompositionData['pataphysical'],
    evolution: {
      subMode: 'evolve', generation: 0, candidates: [], compressibilityLog: [],
      config: { populationSize: 6, targetCubeStrategy: 'least-compressed', memePoolFilter: null },
      baselineScore: null, lastAppliedCubeId: null,
    } as unknown as CompositionData['evolution'],
    decode: { canvasTiles: [], freestyle: false } as unknown as CompositionData['decode'],
    siteContextSnapshot: null,
  };
}

describe('persistCompositionPhotos', () => {
  beforeEach(() => {
    uploadPhoto.mockReset();
    useEncodingStore.setState({
      multiPhotoEnabled: false,
      imageBase64: 'BASE64-SINGLE',
      imageMediaType: 'image/jpeg',
      imageStoragePath: null,
      uploadedImages: [],
    });
  });

  it('uploads a single photo and stamps its path onto the snapshot', async () => {
    uploadPhoto.mockResolvedValue('compositionPhotos/owner-1/abc.jpg');
    const data = snapshotWith([{ id: 'single', thumbnailDataUrl: 'data:thumb', isPrimary: true }]);

    await persistCompositionPhotos('owner-1', data);

    expect(uploadPhoto).toHaveBeenCalledWith('owner-1', 'BASE64-SINGLE', 'image/jpeg');
    expect(data.encode!.images![0].storagePath).toBe('compositionPhotos/owner-1/abc.jpg');
    // Recorded back into the store so the next save reuses the upload.
    expect(useEncodingStore.getState().imageStoragePath).toBe('compositionPhotos/owner-1/abc.jpg');
  });

  it('does not re-upload a photo that is already stored', async () => {
    const data = snapshotWith([
      { id: 'single', thumbnailDataUrl: 'data:thumb', isPrimary: true, storagePath: 'existing/path.jpg' },
    ]);

    await persistCompositionPhotos('owner-1', data);

    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(data.encode!.images![0].storagePath).toBe('existing/path.jpg');
  });

  it('leaves the snapshot thumbnail-only when the upload fails', async () => {
    uploadPhoto.mockResolvedValue(null);
    const data = snapshotWith([{ id: 'single', thumbnailDataUrl: 'data:thumb', isPrimary: true }]);

    await persistCompositionPhotos('owner-1', data);

    expect(data.encode!.images![0].storagePath).toBeUndefined();
    expect(data.encode!.images![0].thumbnailDataUrl).toBe('data:thumb');
  });

  it('skips a restored photo that has no full-resolution bytes to upload', async () => {
    useEncodingStore.setState({ imageBase64: null });
    const data = snapshotWith([{ id: 'single', thumbnailDataUrl: 'data:thumb', isPrimary: true }]);

    await persistCompositionPhotos('owner-1', data);

    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it('uploads each photo in multi-photo mode', async () => {
    useEncodingStore.setState({
      multiPhotoEnabled: true,
      imageBase64: null,
      uploadedImages: [
        { id: 'a', dataUrl: '', base64: 'B64-A', mediaType: 'image/jpeg', thumbnailDataUrl: 't-a' },
        { id: 'b', dataUrl: '', base64: 'B64-B', mediaType: 'image/png', thumbnailDataUrl: 't-b' },
      ],
    });
    uploadPhoto.mockImplementation(async (_owner: string, base64: string) => `path/${base64}.bin`);

    const data = snapshotWith([
      { id: 'a', thumbnailDataUrl: 't-a', isPrimary: true },
      { id: 'b', thumbnailDataUrl: 't-b', isPrimary: false },
    ]);
    await persistCompositionPhotos('owner-1', data);

    expect(uploadPhoto).toHaveBeenCalledTimes(2);
    expect(data.encode!.images!.map(i => i.storagePath)).toEqual([
      'path/B64-A.bin',
      'path/B64-B.bin',
    ]);
    expect(useEncodingStore.getState().uploadedImages.map(i => i.storagePath)).toEqual([
      'path/B64-A.bin',
      'path/B64-B.bin',
    ]);
  });

  it('is a no-op without an owner id', async () => {
    const data = snapshotWith([{ id: 'single', thumbnailDataUrl: 'data:thumb', isPrimary: true }]);
    await persistCompositionPhotos('', data);
    expect(uploadPhoto).not.toHaveBeenCalled();
  });
});

describe('compositionPhotoPaths', () => {
  it('collects only the photos that actually have a stored original', () => {
    const data = snapshotWith([
      { id: 'a', thumbnailDataUrl: 't', isPrimary: true, storagePath: 'p/a.jpg' },
      { id: 'b', thumbnailDataUrl: 't', isPrimary: false },
      { id: 'c', thumbnailDataUrl: 't', isPrimary: false, storagePath: 'p/c.jpg' },
    ]);
    expect(compositionPhotoPaths(data)).toEqual(['p/a.jpg', 'p/c.jpg']);
  });

  it('returns nothing for a composition with no encode block', () => {
    const data = snapshotWith([]);
    data.encode = null;
    expect(compositionPhotoPaths(data)).toEqual([]);
  });
});
