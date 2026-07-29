/**
 * How many connection verdicts the P0-6 fix changes.
 *
 * Reimplements the OLD face model (one face per sphere, two per cylinder) beside
 * the corrected one and compares every verdict for every ordered variation pair
 * meeting at rest on each axis. Run with `node scripts/connection-verdict-delta.mjs`.
 */
const S = 42;
const sph = (c, r) => ({ type: 'sphere', c, r });
const cyl = (axis, ap, r, origin, ext) => ({ type: 'cylinder', axis, ap, r, origin, ext });
const CUT = [
  sph([6.30, 0.00, 13.44], 16.18034),
  sph([42.00, 14.40, 29.20], 9.864601),
  sph([26.54, 42.00, 40.90], 13),
  sph([0.00, 24.30, 29.10], 17.085938),
  cyl('Y', [4.90, -1.20], 16.18034, [4.90, 0.00, -1.20], [0, 51, 0]),
  cyl('X', [-1.80, 27.80], 9.864601, [42.00, -1.80, 27.80], [-51, 0, 0]),
  cyl('Y', [30.60, 26.30], 13, [30.60, 42.00, 26.30], [0, -51, 0]),
  sph([0.00, 37.00, 21.25], 17.085938),
];
const FACES = ['X_NEG', 'X_POS', 'Y_NEG', 'Y_POS', 'Z_NEG', 'Z_POS'];
const PLANE = { X_NEG: [0, 0], X_POS: [0, S], Y_NEG: [1, 0], Y_POS: [1, S], Z_NEG: [2, 0], Z_POS: [2, S] };
const AI = { X: 0, Y: 1, Z: 2 };
const OPP = { X_NEG: 'X_POS', X_POS: 'X_NEG', Y_NEG: 'Y_POS', Y_POS: 'Y_NEG', Z_NEG: 'Z_POS', Z_POS: 'Z_NEG' };

const discReaches = (a, b, r) => {
  const na = Math.min(Math.max(a, 0), S), nb = Math.min(Math.max(b, 0), S);
  return Math.hypot(a - na, b - nb) < r;
};
const spans = (lo, hi) => hi > 0 && lo < S;

function newFaces(k) {
  const out = [];
  for (const f of FACES) {
    const [ax, at] = PLANE[f];
    if (k.type === 'sphere') {
      const d = Math.abs(k.c[ax] - at);
      if (d >= k.r) continue;
      const rad = Math.sqrt(k.r * k.r - d * d);
      const [u, v] = [0, 1, 2].filter(i => i !== ax);
      if (discReaches(k.c[u], k.c[v], rad)) out.push(f);
    } else {
      const kAx = AI[k.axis], perp = [0, 1, 2].filter(i => i !== kAx);
      const lo = Math.min(k.origin[kAx], k.origin[kAx] + k.ext[kAx]);
      const hi = Math.max(k.origin[kAx], k.origin[kAx] + k.ext[kAx]);
      if (ax === kAx) {
        if (lo > at || hi < at) continue;
        if (discReaches(k.ap[0], k.ap[1], k.r)) out.push(f);
      } else {
        const w = perp[0] === ax ? 0 : 1, o = w === 0 ? 1 : 0;
        const d = Math.abs(k.ap[w] - at);
        if (d >= k.r) continue;
        const half = Math.sqrt(k.r * k.r - d * d);
        if (!spans(k.ap[o] - half, k.ap[o] + half)) continue;
        if (!spans(lo, hi)) continue;
        out.push(f);
      }
    }
  }
  return out;
}
function oldFaces(k) {
  if (k.type === 'sphere') {
    const t = 0.1, [x, y, z] = k.c;
    if (Math.abs(x) < t) return ['X_NEG'];
    if (Math.abs(x - S) < t) return ['X_POS'];
    if (Math.abs(y) < t) return ['Y_NEG'];
    if (Math.abs(y - S) < t) return ['Y_POS'];
    if (Math.abs(z) < t) return ['Z_NEG'];
    if (Math.abs(z - S) < t) return ['Z_POS'];
    return [];
  }
  return { X: ['X_NEG', 'X_POS'], Y: ['Y_NEG', 'Y_POS'], Z: ['Z_NEG', 'Z_POS'] }[k.axis];
}

const vars = [];
for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) for (let c = b + 1; c < 8; c++) for (let d = c + 1; d < 8; d++) vars.push([a, b, c, d]);

const newModel = vars.map(v => {
  const r = {}; for (const f of FACES) r[f] = new Set();
  for (const i of v) for (const f of newFaces(CUT[i])) r[f].add(CUT[i].type);
  return r;
});
const oldModel = vars.map(v => {
  const r = {}; for (const f of FACES) r[f] = 'shell';
  for (const i of v) for (const f of oldFaces(CUT[i])) r[f] = CUT[i].type;
  return r;
});

const newConnect = (a, b) => [...a].some(t => b.has(t));
const oldConnect = (a, b) => a !== 'shell' && b !== 'shell' && a === b;

let same = 0, nowOpen = 0, nowClosed = 0;
for (let i = 0; i < 70; i++) for (let j = 0; j < 70; j++) {
  for (const f of ['X_POS', 'Y_POS', 'Z_POS']) {
    const o = oldConnect(oldModel[i][f], oldModel[j][OPP[f]]);
    const n = newConnect(newModel[i][f], newModel[j][OPP[f]]);
    if (o === n) same++; else if (n) nowOpen++; else nowClosed++;
  }
}
const total = same + nowOpen + nowClosed;
const pct = x => `${((100 * x) / total).toFixed(1)}%`;
console.log(`Every ordered variation pair meeting at rest, on all three axes: ${total} verdicts\n`);
console.log(`  unchanged                 ${String(same).padStart(6)}  ${pct(same)}`);
console.log(`  refused before, now open  ${String(nowOpen).padStart(6)}  ${pct(nowOpen)}`);
console.log(`  open before, now refused  ${String(nowClosed).padStart(6)}  ${pct(nowClosed)}`);
