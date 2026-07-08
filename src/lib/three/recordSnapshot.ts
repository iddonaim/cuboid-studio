/**
 * Offscreen still-image renders of cut-cube geometry for translation records.
 *
 * Snapshots are rendered on demand and cached in memory only — never
 * persisted. The cut geometry is already rebuilt from operator records on
 * every composition load, so an image can always be re-derived; storing it
 * would just bloat Firestore documents.
 *
 * Styling matches the viewport's drafting look: white fill, dark edges, and
 * the cutter ghosted in vermilion so the record shows both the result and
 * the tool that produced it.
 */
import * as THREE from 'three';

const SNAPSHOT_SIZE = 256;
const MAX_CACHE_ENTRIES = 80;

let renderer: THREE.WebGLRenderer | null = null;
let rendererFailed = false;

/** Lazy singleton — WebGL contexts are scarce, one is plenty for stills. */
function getRenderer(): THREE.WebGLRenderer | null {
  if (renderer) return renderer;
  if (rendererFailed) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SNAPSHOT_SIZE;
    canvas.height = SNAPSHOT_SIZE;
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(SNAPSHOT_SIZE, SNAPSHOT_SIZE, false);
    renderer.setClearColor(0x000000, 0);
  } catch {
    // Headless / WebGL-less environment — snapshots simply don't render.
    rendererFailed = true;
    renderer = null;
  }
  return renderer;
}

// Keyed by geometry uuids; insertion-ordered Map doubles as a cheap LRU.
const cache = new Map<string, string>();

/**
 * Render `geometry` (a cube in its local [0, CUBE_SIZE] space) with an
 * optional ghosted cutter to a PNG data URL. Returns null where WebGL is
 * unavailable. Never disposes the input geometries — they belong to stores.
 */
export function renderRecordSnapshot(
  geometry: THREE.BufferGeometry,
  cutterGeometry?: THREE.BufferGeometry | null,
): string | null {
  const key = `${geometry.uuid}:${cutterGeometry?.uuid ?? '-'}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const gl = getRenderer();
  if (!gl) return null;

  const scene = new THREE.Scene();
  const created: Array<{ dispose(): void }> = [];

  const fill = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const edgesGeo = new THREE.EdgesGeometry(geometry, 15);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x26241f });
  created.push(fill, edgesGeo, edgeMat);
  scene.add(new THREE.Mesh(geometry, fill));
  scene.add(new THREE.LineSegments(edgesGeo, edgeMat));

  if (cutterGeometry) {
    const ghostFill = new THREE.MeshBasicMaterial({
      color: 0xbc4a1f,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ghostEdgesGeo = new THREE.EdgesGeometry(cutterGeometry, 1);
    const ghostEdgeMat = new THREE.LineBasicMaterial({
      color: 0xbc4a1f,
      transparent: true,
      opacity: 0.7,
    });
    created.push(ghostFill, ghostEdgesGeo, ghostEdgeMat);
    scene.add(new THREE.Mesh(cutterGeometry, ghostFill));
    scene.add(new THREE.LineSegments(ghostEdgesGeo, ghostEdgeMat));
  }

  geometry.computeBoundingSphere();
  const sphere = geometry.boundingSphere ?? new THREE.Sphere(new THREE.Vector3(), 30);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, sphere.radius * 20);
  camera.position
    .set(1.2, 1.0, 1.6)
    .normalize()
    .multiplyScalar(sphere.radius * 3.2)
    .add(sphere.center);
  camera.lookAt(sphere.center);

  try {
    gl.render(scene, camera);
    const url = gl.domElement.toDataURL('image/png');
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, url);
    return url;
  } catch {
    return null;
  } finally {
    created.forEach(d => d.dispose());
  }
}
