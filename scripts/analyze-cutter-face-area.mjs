const S=42, N=400; // sample grid per face
const sph=(n,c,r)=>({n,type:'sphere',c,r});
const cyl=(n,axis,ap,r)=>({n,type:'cylinder',axis,ap,r});
const CUT=[
 sph('SPHERE_01',[6.30,0.00,13.44],16.18034), sph('SPHERE_02',[42.00,14.40,29.20],9.864601),
 sph('SPHERE_03',[26.54,42.00,40.90],13),     sph('SPHERE_04',[0.00,24.30,29.10],17.085938),
 cyl('CYLINDER_05','Y',[4.90,-1.20],16.18034),cyl('CYLINDER_06','X',[-1.80,27.80],9.864601),
 cyl('CYLINDER_07','Y',[30.60,26.30],13),     sph('SPHERE_08',[0.00,37.00,21.25],17.085938)];
const FACES=[['X_NEG',0,0],['X_POS',0,S],['Y_NEG',1,0],['Y_POS',1,S],['Z_NEG',2,0],['Z_POS',2,S]];
const inside=(k,p)=>{
  if(k.type==='sphere') return Math.hypot(p[0]-k.c[0],p[1]-k.c[1],p[2]-k.c[2])<k.r;
  const ai={X:0,Y:1,Z:2}[k.axis], perp=[0,1,2].filter(i=>i!==ai);
  return Math.hypot(p[perp[0]]-k.ap[0],p[perp[1]]-k.ap[1])<k.r;
};
console.log('open area per face, % of the 42x42 face (single cutter):');
for(const k of CUT){
  const row=[];
  for(const [fn,ax,plane] of FACES){
    const others=[0,1,2].filter(i=>i!==ax); let hit=0;
    for(let i=0;i<N;i++)for(let j=0;j<N;j++){
      const p=[0,0,0]; p[ax]=plane;
      p[others[0]]=(i+0.5)*S/N; p[others[1]]=(j+0.5)*S/N;
      if(inside(k,p))hit++;
    }
    const pct=100*hit/(N*N);
    if(pct>0.01) row.push(`${fn} ${pct.toFixed(1)}%`);
  }
  console.log(' ', k.n.padEnd(12), row.join(' · '));
}
