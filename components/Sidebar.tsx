import React, { useState, useRef } from 'react';
import { CubeVariation, ConnectorType, FaceKey, MeshVariation, RhinoMeshData } from '../types';
import { COLORS } from '../constants';

interface SidebarProps {
  variations: CubeVariation[];
  meshVariations: MeshVariation[];
  onSelectVariation: (v: CubeVariation) => void;
  onSelectMeshVariation: (v: MeshVariation) => void;
  selectedVariation: CubeVariation | null;
  selectedMeshVariation: MeshVariation | null;
  usingRhinoMeshes: boolean;
  onImportCatalog: (data: CubeVariation[]) => void;
  onImportRhinoMeshes: (data: RhinoMeshData[]) => void;
  onImportAssembly: (data: any[]) => void;
  onPurge: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  variations,
  meshVariations,
  onSelectVariation,
  onSelectMeshVariation,
  selectedVariation,
  selectedMeshVariation,
  usingRhinoMeshes,
  onImportCatalog,
  onImportRhinoMeshes,
  onImportAssembly,
  onPurge
}) => {
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredParametric = variations.filter(v => {
    if (!v) return false;
    const searchTerm = (search || '').toLowerCase();
    const nameMatch = (v.name || '').toLowerCase().includes(searchTerm);
    const idMatch = (v.id || '').toLowerCase().includes(searchTerm);
    return nameMatch || idMatch;
  });

  const filteredMesh = meshVariations.filter(v => {
    if (!v) return false;
    const searchTerm = (search || '').toLowerCase();
    const nameMatch = (v.name || '').toLowerCase().includes(searchTerm);
    const idMatch = (v.id || '').toLowerCase().includes(searchTerm);
    return nameMatch || idMatch;
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json)) {
          if (json[0] && json[0].vertices && json[0].faces && Array.isArray(json[0].vertices)) {
            onImportRhinoMeshes(json as RhinoMeshData[]);
          } else if (json[0] && typeof json[0] === 'object' && 'cuts' in json[0]) {
            onImportCatalog(json as CubeVariation[]);
          } else if (json[0] && typeof json[0] === 'object' && 'variationId' in json[0]) {
            onImportAssembly(json);
          }
        }
      } catch (err) {
        alert("Invalid JSON format.");
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="w-80 h-full flex flex-col bg-slate-900 border-r border-slate-800 shadow-2xl z-10 overflow-hidden">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-black text-white flex items-center gap-3 italic tracking-tighter">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-sm shadow-[0_0_20px_rgba(79,70,229,0.4)] not-italic">
            <i className="fas fa-microchip"></i>
          </div>
          CUBOID.v3
        </h1>
        <div className="flex gap-2 mt-5">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-[2] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
          >
            Import
          </button>
          <button
            onClick={() => confirm("Purge environment?") && onPurge()}
            className="flex-1 bg-slate-800 hover:bg-rose-900/40 border border-slate-700 text-slate-500 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
          >
            Purge
          </button>
          <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileUpload} />
        </div>
      </div>

      <div className="p-4 border-b border-slate-800">
        <div className="relative">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-700 text-xs"></i>
          <input
            type="text"
            placeholder="Filter Catalog..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
        {usingRhinoMeshes ? (
          filteredMesh.map((v) => (
            <div
              key={v.id}
              onClick={() => onSelectMeshVariation(v)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer group ${
                selectedMeshVariation?.id === v.id
                  ? 'bg-indigo-500/10 border-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.1)]'
                  : 'bg-slate-950/40 border-slate-800 hover:border-slate-600'
              }`}
            >
              <div className="flex justify-between items-center mb-3">
                <span className={`text-[11px] font-black tracking-tight transition-colors ${selectedMeshVariation?.id === v.id ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>
                  {v.id}
                </span>
                <div className="flex items-center gap-2">
                  <div className="text-[9px] text-emerald-400 font-mono">
                    {v.meshData.vertices.length}v
                  </div>
                  <div className="text-[9px] text-cyan-400 font-mono">
                    {v.meshData.faces.length}f
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-slate-600 italic">
                Rhino Mesh
              </div>
            </div>
          ))
        ) : (
          filteredParametric.map((v) => (
            <div
              key={v.id}
              onClick={() => onSelectVariation(v)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer group ${
                selectedVariation?.id === v.id
                  ? 'bg-indigo-500/10 border-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.1)]'
                  : 'bg-slate-950/40 border-slate-800 hover:border-slate-600'
              }`}
            >
              <div className="flex justify-between items-center mb-3">
                <span className={`text-[11px] font-black tracking-tight transition-colors ${selectedVariation?.id === v.id ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>
                  {v.id}
                </span>
                <div className="flex gap-1">
                  {v.cuts.map(c => (
                    <div key={c.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.type === 'sphere' ? COLORS[ConnectorType.Sphere] : COLORS[ConnectorType.Cylinder] }}></div>
                  ))}
                </div>
              </div>
              <div className="flex gap-1 items-center">
                {(['top', 'bottom', 'left', 'right', 'front', 'back'] as FaceKey[]).map(face => (
                  <div key={face} className="h-0.5 flex-1 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full opacity-50"
                      style={{ backgroundColor: COLORS[v.faces[face]] }}
                    ></div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-5 bg-slate-950/80 border-t border-slate-800 backdrop-blur-md">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {Object.entries(COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color as string }}></div>
              <span className="text-[9px] text-slate-500 capitalize font-black tracking-tighter uppercase">{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
