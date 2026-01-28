import React from 'react';
import { PlacedCube, CubeVariation, ConnectorType, FaceKey, MeshVariation } from '../types';
import { COLORS } from '../constants';

interface InspectorProps {
  variations: CubeVariation[];
  meshVariations: MeshVariation[];
  cube: PlacedCube;
  allCubes: PlacedCube[];
  usingRhinoMeshes: boolean;
  onRemove: (id: string) => void;
  onClose: () => void;
}

const Inspector: React.FC<InspectorProps> = ({ variations, meshVariations, cube, onRemove, onClose }) => {
  const meshVar = meshVariations.find(v => v.id === cube.variationId);
  const paramVar = variations.find(v => v.id === cube.variationId);

  if (!meshVar && !paramVar) {
    return (
      <div className="fixed top-6 right-6 w-80 bg-slate-900/95 backdrop-blur-xl border border-rose-500/50 rounded-3xl p-6 z-20">
        <h3 className="text-lg font-black text-rose-400 mb-2">Registry Fault</h3>
        <p className="text-[10px] text-slate-500 mb-4 uppercase">Module ID: {cube.id}</p>
        <button onClick={() => onRemove(cube.id)} className="w-full bg-rose-600/20 text-rose-500 py-3 rounded-xl font-bold uppercase text-[10px]">Delete Instance</button>
      </div>
    );
  }

  const isMeshVar = !!meshVar;

  return (
    <div className="fixed top-6 right-6 w-84 bg-slate-950/90 backdrop-blur-2xl border border-slate-800 rounded-3xl shadow-2xl p-6 z-20">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-xl font-black text-white tracking-tighter">
            {isMeshVar ? 'Rhino Module' : 'Module Logic'}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded text-[9px] font-mono border border-indigo-500/20">
              {meshVar?.id || paramVar?.id}
            </span>
            <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">
              {isMeshVar ? 'Mesh Geometry' : 'Boolean Sequence'}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-600 hover:text-white transition-colors">
          <i className="fas fa-times"></i>
        </button>
      </div>

      <div className="space-y-6">
        {meshVar ? (
          <>
            <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">Mesh Statistics</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col p-2 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-[8px] text-slate-600 uppercase mb-1">Vertices</span>
                  <span className="text-lg font-mono text-emerald-400">{meshVar.meshData.vertices.length}</span>
                </div>
                <div className="flex flex-col p-2 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-[8px] text-slate-600 uppercase mb-1">Faces</span>
                  <span className="text-lg font-mono text-cyan-400">{meshVar.meshData.faces.length}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Complexity</div>
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full ${i < meshVar.complexity ? 'bg-indigo-500' : 'bg-slate-800'}`}
                  />
                ))}
              </div>
            </div>
          </>
        ) : paramVar ? (
          <>
            <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">Active Cutters (4/8)</div>
              <div className="grid grid-cols-4 gap-2">
                {paramVar.cuts.map(cut => (
                  <div key={cut.id} className="flex flex-col items-center p-2 bg-slate-950 rounded-lg border border-slate-800">
                    <i className={`fas ${cut.type === 'sphere' ? 'fa-circle' : 'fa-grip-lines-vertical'} text-[10px] mb-1`}
                       style={{ color: cut.type === 'sphere' ? COLORS[ConnectorType.Sphere] : COLORS[ConnectorType.Cylinder] }}></i>
                    <span className="text-[8px] font-mono text-slate-500">ID-{cut.id}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] px-1">Port Topology</div>
              {(['top', 'bottom', 'left', 'right', 'front', 'back'] as FaceKey[]).map(face => (
                <div key={face} className="flex items-center justify-between bg-slate-900/30 p-2.5 rounded-xl border border-slate-800/50">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS[paramVar.faces[face]] }}></div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase w-12">{face}</span>
                  </div>
                  <span className="text-[9px] font-mono text-slate-600 uppercase">
                    {paramVar.faces[face]}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : null}

        <button
          onClick={() => onRemove(cube.id)}
          className="w-full py-3 rounded-2xl bg-rose-500/5 border border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all"
        >
          Remove Module
        </button>
      </div>
    </div>
  );
};

export default Inspector;
