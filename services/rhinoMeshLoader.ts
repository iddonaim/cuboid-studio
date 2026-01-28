import * as THREE from 'three';
import { RhinoMeshData, MeshVariation } from '../types';

/**
 * Converts Rhino JSON mesh data to Three.js BufferGeometry
 */
export function createGeometryFromRhinoMesh(meshData: RhinoMeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  
  // Convert vertices array to flat Float32Array
  const vertices: number[] = [];
  meshData.vertices.forEach(v => {
    vertices.push(v[0], v[1], v[2]);
  });
  
  // Convert faces to indices
  const indices: number[] = [];
  meshData.faces.forEach(face => {
    if (face.length === 4) {
      // Quad face - split into two triangles
      indices.push(face[0], face[1], face[2]);
      indices.push(face[0], face[2], face[3]);
    } else if (face.length === 3) {
      // Triangle face
      indices.push(face[0], face[1], face[2]);
    }
  });
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  
  // Center the geometry at origin
  geometry.computeBoundingBox();
  const center = new THREE.Vector3();
  geometry.boundingBox!.getCenter(center);
  geometry.translate(-center.x, -center.y, -center.z);
  
  return geometry;
}

/**
 * Loads Rhino mesh JSON file and converts to MeshVariations
 */
export function loadRhinoMeshes(jsonData: RhinoMeshData[]): MeshVariation[] {
  const variations: MeshVariation[] = [];
  
  jsonData.forEach((meshData, index) => {
    variations.push({
      id: `rhino-${index + 1}`,
      name: `Rhino Cube ${index + 1}`,
      meshData,
      complexity: Math.floor(meshData.vertices.length / 1000) // Rough complexity based on vertex count
    });
  });
  
  return variations;
}

/**
 * Calculates the bounding box size of the mesh
 */
export function getMeshSize(meshData: RhinoMeshData): THREE.Vector3 {
  const geometry = createGeometryFromRhinoMesh(meshData);
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox!.getSize(size);
  geometry.dispose();
  return size;
}
