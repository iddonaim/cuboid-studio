// Decodes every shipped GLB (public/models) with the app's own Draco decoder
// and reports, per variation, how solid each face plane is. An uncut face
// reads ~14.7% (hollowing rim; 1.6 wall) or ~100% (closed panel). This is how
// the spec/model frame mismatch was found; renderFrame.test.ts locks its facts.
// Run from repo root: node scripts/measure-glb-face-solidity.cjs
// Decode every shipped GLB with the app's own Draco decoder and measure, for
// each of the 6 face planes, how much of the square is actually solid.
const fs = require('fs');
const path = require('path');

const decoderSrc = fs.readFileSync('public/draco/draco_decoder.js', 'utf8');
eval(decoderSrc); // defines DracoDecoderModule (asm.js build, no wasm fetch)

// -- minimal mat4 (column-major, glTF convention) --
const I4 = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function mul(a, b) { // a*b
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) o[c*4+r] += a[k*4+r]*b[c*4+k];
  return o;
}
function fromTRS(t=[0,0,0], q=[0,0,0,1], s=[1,1,1]) {
  const [x,y,z,w] = q;
  const [sx,sy,sz] = s;
  return [
    (1-2*(y*y+z*z))*sx, (2*(x*y+z*w))*sx, (2*(x*z-y*w))*sx, 0,
    (2*(x*y-z*w))*sy, (1-2*(x*x+z*z))*sy, (2*(y*z+x*w))*sy, 0,
    (2*(x*z+y*w))*sz, (2*(y*z-x*w))*sz, (1-2*(x*x+y*y))*sz, 0,
    t[0], t[1], t[2], 1,
  ];
}
const apply = (m, x, y, z) => [
  m[0]*x + m[4]*y + m[8]*z + m[12],
  m[1]*x + m[5]*y + m[9]*z + m[13],
  m[2]*x + m[6]*y + m[10]*z + m[14],
];

DracoDecoderModule({}).then ? DracoDecoderModule({}).then(run) : DracoDecoderModule({ onModuleLoaded: run });

function decodePrim(draco, bin, json, prim) {
  const ext = prim.extensions && prim.extensions.KHR_draco_mesh_compression;
  if (!ext) return null;
  const bv = json.bufferViews[ext.bufferView];
  const bytes = new Int8Array(bin.buffer, bin.byteOffset + (bv.byteOffset || 0), bv.byteLength);
  const dbuf = new draco.DecoderBuffer();
  dbuf.Init(bytes, bytes.length);
  const decoder = new draco.Decoder();
  const mesh = new draco.Mesh();
  decoder.DecodeBufferToMesh(dbuf, mesh);
  const att = decoder.GetAttributeByUniqueId(mesh, ext.attributes.POSITION);
  const n = mesh.num_points();
  const pa = new draco.DracoFloat32Array();
  decoder.GetAttributeFloatForAllPoints(mesh, att, pa);
  const positions = new Float32Array(n*3);
  for (let i = 0; i < n*3; i++) positions[i] = pa.GetValue(i);
  const nf = mesh.num_faces();
  const indices = new Uint32Array(nf*3);
  const ia = new draco.DracoInt32Array();
  for (let f = 0; f < nf; f++) {
    decoder.GetFaceFromMesh(mesh, f, ia);
    indices[f*3] = ia.GetValue(0); indices[f*3+1] = ia.GetValue(1); indices[f*3+2] = ia.GetValue(2);
  }
  [ia, pa, mesh, decoder, dbuf].forEach(o => draco.destroy(o));
  return { positions, indices };
}

function run(draco) {
  const CUBE_SIZE = 42; // constants.ts
  const out = {};
  for (const file of fs.readdirSync('public/models').filter(f => f.endsWith('.glb')).sort()) {
    const buf = fs.readFileSync(path.join('public/models', file));
    const jsonLen = buf.readUInt32LE(12);
    const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
    let off = 20 + jsonLen, bin = null;
    while (off < buf.length) {
      const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off+4);
      if (type === 0x004E4942) bin = buf.subarray(off+8, off+8+len);
      off += 8 + len;
    }
    // world matrices
    const world = new Map();
    const walk = (idx, parent) => {
      const node = json.nodes[idx];
      const local = node.matrix ? node.matrix.slice() : fromTRS(node.translation, node.rotation, node.scale);
      const m = mul(parent, local);
      world.set(idx, m);
      (node.children || []).forEach(c => walk(c, m));
    };
    json.scenes[json.scene ?? 0].nodes.forEach(n => walk(n, I4()));

    // merge all primitives, transformed
    const chunks = [];
    let total = 0;
    for (const [idx, m] of world) {
      const node = json.nodes[idx];
      if (node.mesh === undefined) continue;
      for (const prim of json.meshes[node.mesh].primitives) {
        const dec = decodePrim(draco, bin, json, prim);
        if (!dec) continue;
        for (let i = 0; i < dec.positions.length; i += 3) {
          const [x,y,z] = apply(m, dec.positions[i], dec.positions[i+1], dec.positions[i+2]);
          dec.positions[i] = x; dec.positions[i+1] = y; dec.positions[i+2] = z;
        }
        chunks.push(dec); total += dec.positions.length/3;
      }
    }
    const pos = new Float32Array(total*3);
    const idxAll = [];
    let vo = 0, po = 0;
    for (const c of chunks) {
      pos.set(c.positions, po);
      for (const i of c.indices) idxAll.push(i + vo);
      vo += c.positions.length/3; po += c.positions.length;
    }
    // bbox + the loader's exact normalization (scale+translate only if maxSize<1)
    const min = [1/0,1/0,1/0], max = [-1/0,-1/0,-1/0];
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
    // per-face-plane solid area
    const planes = {
      X_NEG: [0, min[0]], X_POS: [0, max[0]],
      Y_NEG: [1, min[1]], Y_POS: [1, max[1]],
      Z_NEG: [2, min[2]], Z_POS: [2, max[2]],
    };
    const eps = Math.max(...size.map((_,a)=>max[a]-min[a])) * 1e-3;
    const areas = { X_NEG:0, X_POS:0, Y_NEG:0, Y_POS:0, Z_NEG:0, Z_POS:0 };
    for (let t = 0; t < idxAll.length; t += 3) {
      const p = [idxAll[t]*3, idxAll[t+1]*3, idxAll[t+2]*3];
      for (const face in planes) {
        const [axis, coord] = planes[face];
        if (Math.abs(pos[p[0]+axis]-coord) < eps &&
            Math.abs(pos[p[1]+axis]-coord) < eps &&
            Math.abs(pos[p[2]+axis]-coord) < eps) {
          const ax = pos[p[1]] - pos[p[0]], ay = pos[p[1]+1] - pos[p[0]+1], az = pos[p[1]+2] - pos[p[0]+2];
          const bx = pos[p[2]] - pos[p[0]], by = pos[p[2]+1] - pos[p[0]+1], bz = pos[p[2]+2] - pos[p[0]+2];
          const cx = ay*bz - az*by, cy = az*bx - ax*bz, cz = ax*by - ay*bx;
          areas[face] += Math.sqrt(cx*cx + cy*cy + cz*cz) / 2;
        }
      }
    }
    const fullArea = (max[0]-min[0]) * (max[2]-min[2]); // any pair; cube-ish
    const ratios = {};
    for (const f in areas) ratios[f] = +(areas[f]/fullArea).toFixed(3);
    out[file.replace('.glb','')] = { ratios, size: size.map(n=>+n.toFixed(3)), maxSize: +maxSize.toFixed(4) };
  }
  fs.writeFileSync('scripts/glb-face-solidity.json', JSON.stringify(out, null, 1));
  console.log('wrote scripts/glb-face-solidity.json for', Object.keys(out).length, 'models');
}
