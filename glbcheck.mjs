// For every variation: decode the shipped GLB (the geometry users actually see),
// find which face planes are FULL squares (uncut shell faces), and compare with
// the spec-derived faceCuts the connection law reads.
import * as THREE from 'three';
import * as fs from 'node:fs';
const { CUBE_VARIATIONS } = await import('./src/lib/cube/specifications.ts');
const { computeFaceCuts } = await import('./src/lib/cube/faceCuts.ts');
const { CUBE_SIZE } = await import('./src/lib/cube/constants.ts');

// --- Draco decoder (the exact one the app ships) ---
const dracoSrc = fs.readFileSync('public/draco/draco_decoder.js', 'utf8');
const factory = new Function(dracoSrc + '\n;return DracoDecoderModule;')();
const draco = await factory({});

function decodePrimitive(bin, json, prim) {
  const ext = prim.extensions?.KHR_draco_mesh_compression;
  if (!ext) return null;
  const bv = json.bufferViews[ext.bufferView];
  const bytes = new Int8Array(bin.buffer, bin.byteOffset + (bv.byteOffset || 0), bv.byteLength);
  const dbuf = new draco.DecoderBuffer();
  dbuf.Init(bytes, bytes.length);
  const decoder = new draco.Decoder();
  const mesh = new draco.Mesh();
  const ok = decoder.DecodeBufferToMesh(dbuf, mesh);
  if (!ok || !ok.ok?.() && ok.ok !== undefined ? false : false) {} // status object varies; verify via counts
  const att = decoder.GetAttributeByUniqueId(mesh, ext.attributes.POSITION);
  const n = mesh.num_points();
  const posArr = new draco.DracoFloat32Array();
  decoder.GetAttributeFloatForAllPoints(mesh, att, posArr);
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) positions[i] = posArr.GetValue(i);
  const nf = mesh.num_faces();
  const indices = new Uint32Array(nf * 3);
  const ia = new draco.DracoInt32Array();
  for (let f = 0; f < nf; f++) {
    decoder.GetFaceFromMesh(mesh, f, ia);
    indices[f*3] = ia.GetValue(0); indices[f*3+1] = ia.GetValue(1); indices[f*3+2] = ia.GetValue(2);
  }
  draco.destroy(ia); draco.destroy(posArr); draco.destroy(mesh); draco.destroy(decoder); draco.destroy(dbuf);
  return { positions, indices };
}

function nodeMatrix(node) {
  const m = new THREE.Matrix4();
  if (node.matrix) return m.fromArray(node.matrix);
  const t = node.translation || [0,0,0], r = node.rotation || [0,0,0,1], s = node.scale || [1,1,1];
  return m.compose(new THREE.Vector3(...t), new THREE.Quaternion(...r), new THREE.Vector3(...s));
}

function loadGLB(path) {
  const buf = fs.readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  let off = 20 + jsonLen;
  let bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    if (type === 0x004E4942) bin = buf.subarray(off + 8, off + 8 + len);
    off += 8 + len;
  }
  // world matrices via scene graph walk (mirrors updateMatrixWorld in the loader)
  const world = new Map();
  const walk = (idx, parent) => {
    const node = json.nodes[idx];
    const m = parent.clone().multiply(nodeMatrix(node));
    world.set(idx, m);
    (node.children || []).forEach(c => walk(c, m));
  };
  (json.scenes[json.scene ?? 0].nodes).forEach(n => walk(n, new THREE.Matrix4()));

  const parts = [];
  for (const [idx, m] of world) {
    const node = json.nodes[idx];
    if (node.mesh === undefined) continue;
    for (const prim of json.meshes[node.mesh].primitives) {
      const dec = decodePrimitive(bin, json, prim);
      if (!dec) continue;
      const v = new THREE.Vector3();
      for (let i = 0; i < dec.positions.length; i += 3) {
        v.set(dec.positions[i], dec.positions[i+1], dec.positions[i+2]).applyMatrix4(m);
        dec.positions[i] = v.x; dec.positions[i+1] = v.y; dec.positions[i+2] = v.z;
      }
      parts.push(dec);
    }
  }
  return parts;
}

/** Replicates loadVariationFromGLB's normalization exactly: merge, bbox,
 *  scale+translate ONLY when maxSize < 1. */
function normalize(parts) {
  let count = 0; for (const p of parts) count += p.positions.length;
  const pos = new Float32Array(count);
  const idx = [];
  let vo = 0, po = 0;
  for (const p of parts) {
    pos.set(p.positions, po);
    for (const i of p.indices) idx.push(i + vo);
    vo += p.positions.length / 3; po += p.positions.length;
  }
  const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) {
    if (pos[i+a] < min[a]) min[a] = pos[i+a];
    if (pos[i+a] > max[a]) max[a] = pos[i+a];
  }
  const size = [max[0]-min[0], max[1]-min[1], max[2]-min[2]];
  const maxSize = Math.max(...size);
  if (maxSize < 1) {
    const s = CUBE_SIZE / maxSize;
    for (let i = 0; i < pos.length; i++) pos[i] *= s;
    for (let a = 0; a < 3; a++) { min[a] *= s; max[a] *= s; }
    for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) pos[i+a] -= min[a];
    for (let a = 0; a < 3; a++) { max[a] -= min[a]; min[a] = 0; }
  }
  return { pos, idx, min, max, maxSize };
}

const FACE_PLANES = (min, max) => ({
  X_NEG: [0, min[0]], X_POS: [0, max[0]],
  Y_NEG: [1, min[1]], Y_POS: [1, max[1]],
  Z_NEG: [2, min[2]], Z_POS: [2, max[2]],
});

function faceAreas({ pos, idx, min, max }) {
  const planes = FACE_PLANES(min, max);
  const size = Math.max(max[0]-min[0], max[1]-min[1], max[2]-min[2]);
  const eps = size * 1e-3;
  const areas = { X_NEG:0, X_POS:0, Y_NEG:0, Y_POS:0, Z_NEG:0, Z_POS:0 };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    a.fromArray(pos, idx[t]*3); b.fromArray(pos, idx[t+1]*3); c.fromArray(pos, idx[t+2]*3);
    for (const [face, [axis, coord]] of Object.entries(planes)) {
      if (Math.abs(a.getComponent(axis)-coord) < eps &&
          Math.abs(b.getComponent(axis)-coord) < eps &&
          Math.abs(c.getComponent(axis)-coord) < eps) {
        ab.subVectors(b,a); ac.subVectors(c,a);
        areas[face] += ab.cross(ac).length()/2;
      }
    }
  }
  const full = (max[0]-min[0]) * (max[1]-min[1]); // ~size^2
  return { areas, full };
}

let mismatches = 0, checked = 0;
const report = [];
for (const variation of CUBE_VARIATIONS) {
  const path = `public/models/${variation.id}.glb`;
  if (!fs.existsSync(path)) { report.push(`${variation.id}: NO FILE`); continue; }
  const parts = loadGLB(path);
  const norm = normalize(parts);
  const { areas, full } = faceAreas(norm);
  // A face is "uncut" in the model if its plane is essentially a full square.
  const glbUncut = Object.entries(areas).filter(([,ar]) => ar > 0.95*full).map(([f])=>f).sort();
  const cuts = computeFaceCuts(variation);
  const specUncut = Object.entries(cuts).filter(([,s]) => s.size === 0).map(([f])=>f).sort();
  checked++;
  const same = JSON.stringify(glbUncut) === JSON.stringify(specUncut);
  if (!same) mismatches++;
  if (!same || variation.id === 'v-33') {
    report.push(`${variation.id}: GLB uncut=[${glbUncut}] spec uncut=[${specUncut}] ${same?'OK':'MISMATCH'}  maxSize=${norm.maxSize.toFixed(3)}  areas=${Object.entries(areas).map(([f,a])=>`${f}:${(a/full*100).toFixed(0)}%`).join(' ')}`);
  }
}
console.log(report.join('\n'));
console.log(`\n${checked} checked, ${mismatches} mismatches between shipped model and spec`);
