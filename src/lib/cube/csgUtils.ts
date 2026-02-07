/**
 * CSG Boolean Operations for Cuboid Studio
 * =========================================
 *
 * This module handles geometry generation for cube variations.
 *
 * TWO MODES:
 * 1. CSG Mode (current): Computes boolean operations at runtime
 * 2. GLB Mode (recommended for production): Loads pre-computed meshes
 *
 * The shell operation proved too complex for runtime CSG. For proper shelled
 * geometry, export from Grasshopper as .glb files and use loadVariationFromGLB().
 *
 * See SERIALIZATION_GUIDE.md for export instructions.
 */

import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import {
  CUBE_VARIATIONS,
  CutterSpec,
  SphereSpec,
  CylinderSpec,
  CubeVariation
} from './specifications';
import { CUBE_SIZE } from './constants';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Set to true to load pre-computed GLB files instead of runtime CSG
export const USE_PRECOMPUTED_MODELS = true;

// Path to pre-computed model files (relative to public folder)
export const MODELS_PATH = '/models';

// Segment counts for CSG geometry (lower = faster, higher = smoother)
const SPHERE_SEGMENTS = 24;
const CYLINDER_SEGMENTS = 24;

// =============================================================================
// INTERNALS
// =============================================================================

const evaluator = new Evaluator();

// Set up DRACO loader for compressed GLB files
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

const geometryCache = new Map<string, THREE.BufferGeometry>();

// =============================================================================
// CSG GEOMETRY GENERATION (Runtime)
// =============================================================================

/**
 * Creates the base cube brush.
 */
function createCubeBrush(): Brush {
  const geometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  geometry.translate(CUBE_SIZE / 2, CUBE_SIZE / 2, CUBE_SIZE / 2);
  return new Brush(geometry, new THREE.MeshStandardMaterial());
}

/**
 * Creates a sphere cutter brush.
 */
function createSphereBrush(spec: SphereSpec): Brush {
  const geometry = new THREE.SphereGeometry(spec.radius, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
  geometry.translate(spec.center[0], spec.center[1], spec.center[2]);
  return new Brush(geometry, new THREE.MeshStandardMaterial());
}

/**
 * Creates a cylinder cutter brush.
 */
function createCylinderBrush(spec: CylinderSpec): Brush {
  const geometry = new THREE.CylinderGeometry(spec.radius, spec.radius, spec.length, CYLINDER_SEGMENTS);

  if (spec.axis === 'X') {
    geometry.rotateZ(Math.PI / 2);
    geometry.translate(CUBE_SIZE / 2, spec.axisPosition[0], spec.axisPosition[1]);
  } else if (spec.axis === 'Y') {
    geometry.translate(spec.axisPosition[0], CUBE_SIZE / 2, spec.axisPosition[1]);
  } else if (spec.axis === 'Z') {
    geometry.rotateX(Math.PI / 2);
    geometry.translate(spec.axisPosition[0], spec.axisPosition[1], CUBE_SIZE / 2);
  }

  return new Brush(geometry, new THREE.MeshStandardMaterial());
}

/**
 * Creates a cutter brush from specification.
 */
function createCutterBrush(spec: CutterSpec): Brush {
  if (spec.type === 'sphere') {
    return createSphereBrush(spec as SphereSpec);
  } else {
    return createCylinderBrush(spec as CylinderSpec);
  }
}

/**
 * Generates CSG geometry for a variation (cube minus cutters).
 * This is the SOLID version without shell/wall thickness.
 */
export function generateVariationGeometry(variation: CubeVariation): THREE.BufferGeometry {
  const cacheKey = variation.id;

  if (geometryCache.has(cacheKey)) {
    return geometryCache.get(cacheKey)!;
  }

  try {
    let result = createCubeBrush();

    for (const cutter of variation.cutters) {
      const cutterBrush = createCutterBrush(cutter);
      result = evaluator.evaluate(result, cutterBrush, SUBTRACTION);
    }

    const geometry = result.geometry.clone();
    geometryCache.set(cacheKey, geometry);
    return geometry;
  } catch (error) {
    console.error(`Failed to generate geometry for ${variation.id}:`, error);
    // Fallback to plain cube
    const fallback = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
    fallback.translate(CUBE_SIZE / 2, CUBE_SIZE / 2, CUBE_SIZE / 2);
    return fallback;
  }
}

// =============================================================================
// GLB LOADING (Pre-computed models from Grasshopper)
// =============================================================================

/**
 * Loads a pre-computed variation geometry from a GLB file.
 *
 * @param variationId - e.g., "v-1", "v-42"
 * @returns Promise resolving to BufferGeometry
 */
export async function loadVariationFromGLB(variationId: string): Promise<THREE.BufferGeometry> {
  const cacheKey = `${variationId}-glb`;

  if (geometryCache.has(cacheKey)) {
    console.log(`[GLB] Cache hit for ${variationId}`);
    return geometryCache.get(cacheKey)!;
  }

  const url = `${MODELS_PATH}/${variationId}.glb`;
  console.log(`[GLB] Loading ${url}...`);

  try {
    const gltf = await gltfLoader.loadAsync(url);

    // Collect all mesh geometries
    const geometries: THREE.BufferGeometry[] = [];
    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        // Clone and apply any transforms from the mesh
        const geo = child.geometry.clone();
        child.updateMatrixWorld();
        geo.applyMatrix4(child.matrixWorld);
        geometries.push(geo);
      }
    });

    console.log(`[GLB] Found ${geometries.length} meshes in ${variationId}`);

    if (geometries.length === 0) {
      throw new Error(`No mesh found in ${url}`);
    }

    // Merge all geometries into one
    let mergedGeometry: THREE.BufferGeometry;
    if (geometries.length === 1) {
      mergedGeometry = geometries[0];
    } else {
      // Use BufferGeometryUtils to merge
      const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
      const merged = mergeGeometries(geometries, false);
      if (!merged) {
        throw new Error(`Failed to merge geometries for ${variationId}`);
      }
      mergedGeometry = merged;
    }

    console.log(`[GLB] Merged geometry has ${mergedGeometry.attributes.position?.count} vertices`);

    // Check bounding box and auto-scale if needed
    mergedGeometry.computeBoundingBox();
    const box = mergedGeometry.boundingBox!;

    const currentSizeX = box.max.x - box.min.x;
    const currentSizeY = box.max.y - box.min.y;
    const currentSizeZ = box.max.z - box.min.z;
    const maxCurrentSize = Math.max(currentSizeX, currentSizeY, currentSizeZ);

    console.log(`[GLB] Original size: ${currentSizeX.toFixed(2)} x ${currentSizeY.toFixed(2)} x ${currentSizeZ.toFixed(2)}`);

    // Auto-scale if geometry is too small (expected size is ~42 units)
    if (maxCurrentSize < 1) {
      const scaleFactor = CUBE_SIZE / maxCurrentSize;
      console.log(`[GLB] Auto-scaling by ${scaleFactor.toFixed(1)}x`);

      // Scale the geometry
      mergedGeometry.scale(scaleFactor, scaleFactor, scaleFactor);

      // Recompute bounding box after scaling
      mergedGeometry.computeBoundingBox();
      const newBox = mergedGeometry.boundingBox!;

      // Translate to origin (0,0,0) to match expected cube position
      const offsetX = -newBox.min.x;
      const offsetY = -newBox.min.y;
      const offsetZ = -newBox.min.z;
      mergedGeometry.translate(offsetX, offsetY, offsetZ);

      // Final bounding box check
      mergedGeometry.computeBoundingBox();
      const finalBox = mergedGeometry.boundingBox!;
      console.log(`[GLB] Final size: ${(finalBox.max.x - finalBox.min.x).toFixed(2)} x ${(finalBox.max.y - finalBox.min.y).toFixed(2)} x ${(finalBox.max.z - finalBox.min.z).toFixed(2)}`);
      console.log(`[GLB] Final position: (${finalBox.min.x.toFixed(2)}, ${finalBox.min.y.toFixed(2)}, ${finalBox.min.z.toFixed(2)}) to (${finalBox.max.x.toFixed(2)}, ${finalBox.max.y.toFixed(2)}, ${finalBox.max.z.toFixed(2)})`);
    }

    geometryCache.set(cacheKey, mergedGeometry);
    return mergedGeometry;
  } catch (error) {
    console.error(`Failed to load ${url}:`, error);
    // Fallback to CSG generation
    const variation = CUBE_VARIATIONS.find(v => v.id === variationId);
    if (variation) {
      console.log(`[GLB] Falling back to CSG for ${variationId}`);
      return generateVariationGeometry(variation);
    }
    throw error;
  }
}

/**
 * Gets geometry for a variation, using either GLB or CSG based on configuration.
 */
export async function getVariationGeometryAsync(variation: CubeVariation): Promise<THREE.BufferGeometry> {
  if (USE_PRECOMPUTED_MODELS) {
    return loadVariationFromGLB(variation.id);
  } else {
    return generateVariationGeometry(variation);
  }
}

/**
 * Synchronous geometry getter (CSG only, for backwards compatibility).
 */
export function getVariationGeometry(variationId: string): THREE.BufferGeometry | null {
  const variation = CUBE_VARIATIONS.find(v => v.id === variationId);
  if (!variation) return null;
  return generateVariationGeometry(variation);
}

// =============================================================================
// CACHE MANAGEMENT
// =============================================================================

/**
 * Pre-generates all 70 variation geometries using CSG.
 */
export function preGenerateAllGeometries(): void {
  clearGeometryCache();
  console.log('Pre-generating CSG geometries for all 70 variations...');
  const startTime = performance.now();

  let generated = 0;
  for (const variation of CUBE_VARIATIONS) {
    try {
      generateVariationGeometry(variation);
      generated++;
      if (generated % 10 === 0) {
        console.log(`  Generated ${generated}/70 variations...`);
      }
    } catch (error) {
      console.error(`Failed to generate ${variation.id}:`, error);
    }
  }

  const elapsed = performance.now() - startTime;
  console.log(`Generated ${generated} geometries in ${elapsed.toFixed(0)}ms`);
}

/**
 * Pre-loads all GLB models.
 */
export async function preLoadAllGLBModels(): Promise<void> {
  console.log('Pre-loading GLB models for all 70 variations...');
  const startTime = performance.now();

  const promises = CUBE_VARIATIONS.map(v => loadVariationFromGLB(v.id));
  const results = await Promise.allSettled(promises);

  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const elapsed = performance.now() - startTime;
  console.log(`Loaded ${succeeded}/70 GLB models in ${elapsed.toFixed(0)}ms`);
}

/**
 * Clears the geometry cache.
 */
export function clearGeometryCache(): void {
  geometryCache.forEach(geometry => geometry.dispose());
  geometryCache.clear();
}

// =============================================================================
// SHELL GEOMETRY (NOT IMPLEMENTED - Use Grasshopper export instead)
// =============================================================================

/**
 * Shell geometry generation was attempted but proved too complex for runtime CSG.
 *
 * The proper shell requires:
 * 1. Hollow box with uniform wall thickness
 * 2. Hollow sphere/cylinder cutters that create wall thickness around cuts
 * 3. Boolean union of hollow cutters with hollow box
 * 4. Intersection with bounding cube to trim
 * 5. One face left open (largest flat surface area)
 *
 * This is best done in Grasshopper and exported as GLB files.
 * See SERIALIZATION_GUIDE.md for export instructions.
 *
 * For now, this function just returns the solid (non-shelled) geometry.
 */
export function generateVariationGeometryWithShell(variation: CubeVariation): THREE.BufferGeometry {
  console.warn(`Shell geometry not implemented. Using solid geometry for ${variation.id}. Export from Grasshopper for proper shells.`);
  return generateVariationGeometry(variation);
}
