const S = 42;
const sph = (name,c,r)=>({name,type:'sphere',c,r});
const cyl = (name,axis,ap,r)=>({name,type:'cylinder',axis,ap,r});
const CUT = [
  sph('SPHERE_01',[6.30,0.00,13.44],16.18034),
  sph('SPHERE_02',[42.00,14.40,29.20],9.864601),
  sph('SPHERE_03',[26.54,42.00,40.90],13),
  sph('SPHERE_04',[0.00,24.30,29.10],17.085938),
  cyl('CYLINDER_05','Y',[4.90,-1.20],16.18034),   // [X,Z]
  cyl('CYLINDER_06','X',[-1.80,27.80],9.864601),  // [Y,Z]
  cyl('CYLINDER_07','Y',[30.60,26.30],13),        // [X,Z]
  sph('SPHERE_08',[0.00,37.00,21.25],17.085938),
];
const FACES=[['X_NEG',0,0],['X_POS',0,S],['Y_NEG',1,0],['Y_POS',1,S],['Z_NEG',2,0],['Z_POS',2,S]];

// does a disc (centre a,b radius rad) overlap the square [0,S]x[0,S]?
const discHitsSquare=(a,b,rad)=>{
  const cx=Math.max(0,Math.min(S,a)), cy=Math.max(0,Math.min(S,b));
  return Math.hypot(a-cx,b-cy) < rad;
};

function facesCut(k){
  const out=[];
  for(const [fname,ax,plane] of FACES){
    const others=[0,1,2].filter(i=>i!==ax);
    if(k.type==='sphere'){
      const d=Math.abs(k.c[ax]-plane);
      if(d>=k.r) continue;
      const rad=Math.sqrt(k.r*k.r-d*d);
      if(discHitsSquare(k.c[others[0]],k.c[others[1]],rad)) out.push(fname);
    } else {
      const axIdx={X:0,Y:1,Z:2}[k.axis];
      // axisPosition is given in the two non-axis dims, in ascending index order
      const perp=[0,1,2].filter(i=>i!==axIdx);
      const pos={}; pos[perp[0]]=k.ap[0]; pos[perp[1]]=k.ap[1];
      if(ax===axIdx){
        // face perpendicular to the cylinder axis: the full cross-section disc
        if(discHitsSquare(pos[perp[0]],pos[perp[1]],k.r)) out.push(fname);
      } else {
        // side face: cylinder breaches it if the axis line is within r of the plane
        const d=Math.abs(pos[ax]-plane);
        if(d<k.r) out.push(fname);
      }
    }
  }
  return out;
}

console.log('=== what each cutter ACTUALLY cuts (analytic, from specs) ===');
const map={};
for(const k of CUT){ const f=facesCut(k); map[k.name]=f;
  console.log(k.name.padEnd(12), k.type.padEnd(9), '->', f.join(', ')||'(none)'); }

console.log('\n=== code model (getSphereFace / getCylinderFaces) ===');
const codeSphereFace=(c)=>{
  const t=0.1;
  if(Math.abs(c[0])<t)return'X_NEG'; if(Math.abs(c[0]-S)<t)return'X_POS';
  if(Math.abs(c[1])<t)return'Y_NEG'; if(Math.abs(c[1]-S)<t)return'Y_POS';
  if(Math.abs(c[2])<t)return'Z_NEG'; if(Math.abs(c[2]-S)<t)return'Z_POS';
  return null;
};
for(const k of CUT){
  const codeF = k.type==='sphere' ? [codeSphereFace(k.c)].filter(Boolean)
    : {X:['X_NEG','X_POS'],Y:['Y_NEG','Y_POS'],Z:['Z_NEG','Z_POS']}[k.axis];
  const real=map[k.name];
  const missed=real.filter(f=>!codeF.includes(f));
  console.log(k.name.padEnd(12),'code:',codeF.join(',').padEnd(16),'| MISSED:',missed.join(',')||'—');
}

// ---- per-variation, corrected model ----
const idx=[...Array(8).keys()], vars=[];
for(let a=0;a<8;a++)for(let b=a+1;b<8;b++)for(let c=b+1;c<8;c++)for(let d=c+1;d<8;d++)vars.push([a,b,c,d]);
const codeSphereFace2=(c)=>{const t=0.1;
  if(Math.abs(c[0])<t)return'X_NEG'; if(Math.abs(c[0]-S)<t)return'X_POS';
  if(Math.abs(c[1])<t)return'Y_NEG'; if(Math.abs(c[1]-S)<t)return'Y_POS';
  if(Math.abs(c[2])<t)return'Z_NEG'; if(Math.abs(c[2]-S)<t)return'Z_POS'; return null;};

const realShellCounts={}, codeShellCounts={};
let zCutReal=0, zCutCode=0, disagree=0;
const faceNames=FACES.map(f=>f[0]);
for(const v of vars){
  const real=new Set(), code=new Set();
  for(const i of v){
    const k=CUT[i];
    facesCut(k).forEach(f=>real.add(f));
    if(k.type==='sphere'){const f=codeSphereFace2(k.c); if(f)code.add(f);}
    else {({X:['X_NEG','X_POS'],Y:['Y_NEG','Y_POS'],Z:['Z_NEG','Z_POS']}[k.axis]).forEach(f=>code.add(f));}
  }
  const rShell=faceNames.filter(f=>!real.has(f)).length;
  const cShell=faceNames.filter(f=>!code.has(f)).length;
  realShellCounts[rShell]=(realShellCounts[rShell]||0)+1;
  codeShellCounts[cShell]=(codeShellCounts[cShell]||0)+1;
  if(real.has('Z_NEG')||real.has('Z_POS'))zCutReal++;
  if(code.has('Z_NEG')||code.has('Z_POS'))zCutCode++;
  if(rShell!==cShell)disagree++;
}
console.log('\n=== uncut ("shell") faces per variation, out of 6 ===');
console.log('REAL geometry :', JSON.stringify(realShellCounts));
console.log('CODE model    :', JSON.stringify(codeShellCounts));
console.log('\nvariations with at least one DEPTH (Z) face cut:');
console.log('  real:', zCutReal, '/ 70      code:', zCutCode, '/ 70');
console.log('variations where the two models disagree on shell count:', disagree, '/ 70');
