import React, { useState, useEffect, useCallback } from 'react';
import {
  getActiveSiteContext,
  setActiveSiteContext,
  clearActiveSiteContext,
  SiteContextData,
} from '../../lib/storage/siteContext';
import { getPrimaryExposure } from '../../lib/astronomy/suncalc';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Shared input class constants
// ---------------------------------------------------------------------------

const inputCls = "w-full box-border px-2 py-1.5 font-[inherit] text-[11px] text-[#e0e0e0] bg-ink-100 border border-ink-200 rounded outline-none focus:border-primary";
const textareaCls = `${inputCls} min-h-[60px] resize-y leading-relaxed`;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const Label: React.FC<{ text: string; sub?: string }> = ({ text, sub }) => (
  <label className="block text-[10px] font-semibold text-ink-600 mb-1">
    {text}
    {sub && <span className="block font-normal text-[9px] text-ink-500 mt-px">{sub}</span>}
  </label>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mt-4">
    <div className="text-[10px] font-semibold text-primary mb-2 pb-1 border-b border-ink-200 tracking-[0.05em] uppercase">
      {title}
    </div>
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Default data
// ---------------------------------------------------------------------------

function emptyQuantitative() {
  return {
    location: { lat: '', lng: '', address: '' },
    sun: { primary_exposure: '', shadow_hours_winter: '', shadow_hours_summer: '' },
    wind: { dominant_direction: '', intensity: '' },
    transit: { walkability_notes: '', bus_stops_nearby: '', primary_mode: '' },
    morphology: { typology: '', street_width: '', dominant_height: '', lot_dimensions: '', topography: '', dominant_directionality: '' },
  };
}

function emptyProgrammatic() {
  return {
    existing_uses: [{ use: '', formal: true, notes: '' }],
    historical_uses: [{ use: '', period: '', notes: '' }],
  };
}

function emptyReading() {
  return { tensions: '', spatial_qualities: '', social_dynamics: '', notes: '' };
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface SiteContextCuratorProps {
  open: boolean;
  onClose: () => void;
}

export const SiteContextCurator: React.FC<SiteContextCuratorProps> = ({ open, onClose }) => {
  const [tab, setTab] = useState('quantitative');
  const [siteName, setSiteName] = useState('');
  const [q, setQ] = useState(emptyQuantitative);
  const [p, setP] = useState(emptyProgrammatic);
  const [r, setR] = useState(emptyReading);
  const [autoSun, setAutoSun] = useState(true);
  const [sunOk, setSunOk] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load existing context on open
  useEffect(() => {
    if (!open) return;
    const existing = getActiveSiteContext();
    if (existing) {
      setSiteName(existing.site_name || '');
      setQ(existing.quantitative as any || emptyQuantitative());
      setP(existing.programmatic as any || emptyProgrammatic());
      setR(existing.architects_reading as any || emptyReading());
    }
  }, [open]);

  // Auto sun computation
  useEffect(() => {
    const lat = parseFloat(q.location.lat), lng = parseFloat(q.location.lng);
    if (!autoSun || isNaN(lat) || isNaN(lng)) { setSunOk(false); return; }
    try {
      const s = getPrimaryExposure(lat, lng);
      setQ(prev => ({
        ...prev,
        sun: {
          ...prev.sun,
          primary_exposure: `Noon altitude ${s.summer_noon_alt} (summer, ${s.summer_noon_az}) / ${s.winter_noon_alt} (winter, ${s.winter_noon_az})`,
          shadow_hours_winter: `~${s.winter_daylight}h daylight (Dec solstice)`,
          shadow_hours_summer: `~${s.summer_daylight}h daylight (Jun solstice)`,
        },
      }));
      setSunOk(true);
    } catch { setSunOk(false); }
  }, [q.location.lat, q.location.lng, autoSun]);

  const geocode = async () => {
    if (!q.location.address.trim()) return;
    setGeocoding(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q.location.address)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Geocoding failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setQ(prev => ({
        ...prev,
        location: {
          ...prev.location,
          lat: parseFloat(data.lat).toFixed(6),
          lng: parseFloat(data.lng).toFixed(6),
        },
      }));
    } catch (err) {
      console.error('Geocode failed:', err);
    }
    setGeocoding(false);
  };

  const buildExport = useCallback((): SiteContextData => {
    return {
      site_name: siteName || 'Unnamed site',
      generated: new Date().toISOString(),
      quantitative: q,
      programmatic: {
        existing_uses: p.existing_uses.filter(u => u.use.trim()),
        historical_uses: p.historical_uses.filter(u => u.use.trim()),
      },
      architects_reading: Object.fromEntries(
        Object.entries(r).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])
      ),
    };
  }, [siteName, q, p, r]);

  const handleSave = () => {
    const data = buildExport();
    setActiveSiteContext(data);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    clearActiveSiteContext();
    setSiteName('');
    setQ(emptyQuantitative());
    setP(emptyProgrammatic());
    setR(emptyReading());
  };

  if (!open) return null;

  const upQ = (section: string, field: string, value: string) => {
    setQ(prev => ({ ...prev, [section]: { ...(prev as any)[section], [field]: value } }));
  };

  const autoInputCls = (active: boolean) =>
    `${inputCls} ${active ? 'bg-[#0f1d15]' : ''}`;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000]"
      onClick={onClose}
    >
      <div
        className="bg-ink-100 rounded-xl border border-ink-200 w-[90vw] max-w-[640px] max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-ink-200">
          <div>
            <div className="text-[10px] text-ink-500 tracking-[0.1em] uppercase">
              Topological Translation
            </div>
            <h2 className="text-ink-900 text-base font-semibold mt-1">Site Context Curator</h2>
          </div>
          <button
            onClick={onClose}
            className="bg-transparent border-0 text-ink-600 text-2xl cursor-pointer leading-none"
          >
            &times;
          </button>
        </div>

        {/* Site name */}
        <div className="px-5 py-2 border-b border-ink-200">
          <input
            value={siteName}
            onChange={e => setSiteName(e.target.value)}
            placeholder="Site name..."
            className="w-full box-border bg-transparent border-0 border-b border-ink-200 rounded-none px-0 py-1 text-[13px] font-medium text-primary outline-none font-[inherit]"
          />
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 overflow-hidden">
          <TabsList className="w-full rounded-none h-auto p-0 bg-transparent border-b border-ink-200 justify-start">
            {[
              { id: 'quantitative', label: 'Quantitative' },
              { id: 'programmatic', label: 'Programmatic' },
              { id: 'reading', label: "Architect's Reading" },
              { id: 'export', label: 'Save' },
            ].map(t => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="flex-1 rounded-none h-auto py-2.5 px-2 text-[10px] tracking-[0.05em] uppercase font-normal data-[state=active]:font-semibold data-[state=active]:bg-ink-100 data-[state=active]:text-ink-800 data-[state=inactive]:text-ink-500 data-[state=active]:shadow-none border-b-2 border-b-transparent data-[state=active]:border-b-cyan-400"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto px-5 py-3 pb-6">

            {/* ── QUANTITATIVE ── */}
            <TabsContent value="quantitative" className="mt-0">
              <Section title="Location">
                <div className="mb-2">
                  <Label text="Address / Site name" />
                  <div className="flex gap-1.5">
                    <input
                      value={q.location.address}
                      onChange={e => upQ('location', 'address', e.target.value)}
                      placeholder="e.g. Neve Sha'anan & Levinsky, Tel Aviv"
                      className={`${inputCls} flex-1`}
                    />
                    <button
                      onClick={geocode}
                      disabled={geocoding}
                      className={`px-2.5 py-1.5 bg-ink-100 border border-ink-200 rounded text-[10px] whitespace-nowrap cursor-pointer ${geocoding ? 'text-ink-400 cursor-wait' : 'text-primary'}`}
                    >
                      {geocoding ? '...' : 'GEOCODE'}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <Label text="Latitude" />
                    <input value={q.location.lat} onChange={e => upQ('location', 'lat', e.target.value)} placeholder="32.0853" className={inputCls} />
                  </div>
                  <div>
                    <Label text="Longitude" />
                    <input value={q.location.lng} onChange={e => upQ('location', 'lng', e.target.value)} placeholder="34.7818" className={inputCls} />
                  </div>
                </div>
              </Section>

              <Section title="Sun & Wind">
                <div className="flex justify-between items-center mb-2">
                  <button
                    onClick={() => setAutoSun(!autoSun)}
                    className={`px-2 py-1 rounded text-[9px] cursor-pointer border ${autoSun ? 'bg-green-50 border-green-600/50/40 text-green-700' : 'bg-ink-100 border-ink-200 text-ink-500'}`}
                  >
                    {autoSun ? 'Auto sun ON' : 'Auto sun OFF'}
                  </button>
                  {sunOk && <span className="text-[9px] text-green-600">computed</span>}
                </div>
                <div className="mb-2">
                  <Label text="Primary sun exposure" />
                  <input value={q.sun.primary_exposure} onChange={e => upQ('sun', 'primary_exposure', e.target.value)} placeholder="e.g. West-facing, intense afternoon" className={autoInputCls(sunOk && autoSun)} />
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <Label text="Daylight (winter)" />
                    <input value={q.sun.shadow_hours_winter} onChange={e => upQ('sun', 'shadow_hours_winter', e.target.value)} placeholder="~9.5h" className={autoInputCls(sunOk && autoSun)} />
                  </div>
                  <div>
                    <Label text="Daylight (summer)" />
                    <input value={q.sun.shadow_hours_summer} onChange={e => upQ('sun', 'shadow_hours_summer', e.target.value)} placeholder="~14.3h" className={autoInputCls(sunOk && autoSun)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label text="Dominant wind" />
                    <input value={q.wind.dominant_direction} onChange={e => upQ('wind', 'dominant_direction', e.target.value)} placeholder="NW sea breeze" className={inputCls} />
                  </div>
                  <div>
                    <Label text="Wind intensity" />
                    <input value={q.wind.intensity} onChange={e => upQ('wind', 'intensity', e.target.value)} placeholder="moderate" className={inputCls} />
                  </div>
                </div>
              </Section>

              <Section title="Transit & Movement">
                <div className="mb-2">
                  <Label text="Primary movement mode" />
                  <input value={q.transit.primary_mode} onChange={e => upQ('transit', 'primary_mode', e.target.value)} placeholder="e.g. Heavily pedestrian" className={inputCls} />
                </div>
                <div className="mb-2">
                  <Label text="Transit stops nearby" />
                  <input value={q.transit.bus_stops_nearby} onChange={e => upQ('transit', 'bus_stops_nearby', e.target.value)} placeholder="e.g. 3 bus stops within 200m" className={inputCls} />
                </div>
                <div>
                  <Label text="Walkability notes" />
                  <textarea value={q.transit.walkability_notes} onChange={e => upQ('transit', 'walkability_notes', e.target.value)} placeholder="e.g. Narrow sidewalks, market spills into street" className={textareaCls} />
                </div>
              </Section>

              <Section title="Morphology & Typology">
                <div className="mb-2">
                  <Label text="Typology" sub="Describe, don't categorize" />
                  <textarea value={q.morphology.typology} onChange={e => upQ('morphology', 'typology', e.target.value)} placeholder="e.g. Dense urban grid, Bauhaus 3-4 story" className={textareaCls} />
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <Label text="Street width" />
                    <input value={q.morphology.street_width} onChange={e => upQ('morphology', 'street_width', e.target.value)} placeholder="8m" className={inputCls} />
                  </div>
                  <div>
                    <Label text="Dominant height" />
                    <input value={q.morphology.dominant_height} onChange={e => upQ('morphology', 'dominant_height', e.target.value)} placeholder="12-15m / 4 stories" className={inputCls} />
                  </div>
                </div>
                <div className="mb-2">
                  <Label text="Lot dimensions" />
                  <input value={q.morphology.lot_dimensions} onChange={e => upQ('morphology', 'lot_dimensions', e.target.value)} placeholder="200-400 sqm" className={inputCls} />
                </div>
                <div className="mb-2">
                  <Label text="Topography" />
                  <input value={q.morphology.topography} onChange={e => upQ('morphology', 'topography', e.target.value)} placeholder="Flat" className={inputCls} />
                </div>
                <div>
                  <Label text="Dominant directionality" sub="Strong axis — street, slope, wind, view" />
                  <input value={q.morphology.dominant_directionality} onChange={e => upQ('morphology', 'dominant_directionality', e.target.value)} placeholder="e.g. Strong N-S along Levinsky" className={inputCls} />
                </div>
              </Section>
            </TabsContent>

            {/* ── PROGRAMMATIC ── */}
            <TabsContent value="programmatic" className="mt-0">
              <Section title="Existing Uses">
                {p.existing_uses.map((item, i) => (
                  <div key={i} className="bg-ink-100 border border-ink-200 rounded-md p-3 mb-2 relative">
                    {p.existing_uses.length > 1 && (
                      <button
                        onClick={() => setP(prev => ({ ...prev, existing_uses: prev.existing_uses.filter((_, j) => j !== i) }))}
                        className="absolute top-1.5 right-2 bg-transparent border-0 text-ink-400 cursor-pointer text-sm"
                      >
                        &times;
                      </button>
                    )}
                    <div className="mb-1.5">
                      <Label text="Use" />
                      <input value={item.use} onChange={e => { const u = [...p.existing_uses]; u[i] = { ...u[i], use: e.target.value }; setP(prev => ({ ...prev, existing_uses: u })); }} placeholder="e.g. Street-level spice market" className={inputCls} />
                    </div>
                    <div className="flex gap-3 mb-1.5">
                      <label className={`text-[10px] flex items-center gap-1 cursor-pointer ${item.formal ? 'text-green-600' : 'text-ink-500'}`}>
                        <input type="radio" name={`formal-${i}`} checked={item.formal} onChange={() => { const u = [...p.existing_uses]; u[i] = { ...u[i], formal: true }; setP(prev => ({ ...prev, existing_uses: u })); }} className="accent-green-500" />Formal
                      </label>
                      <label className={`text-[10px] flex items-center gap-1 cursor-pointer ${!item.formal ? 'text-destructive' : 'text-ink-500'}`}>
                        <input type="radio" name={`formal-${i}`} checked={!item.formal} onChange={() => { const u = [...p.existing_uses]; u[i] = { ...u[i], formal: false }; setP(prev => ({ ...prev, existing_uses: u })); }} className="accent-red-500" />Informal
                      </label>
                    </div>
                    <div>
                      <Label text="Notes" />
                      <input value={item.notes} onChange={e => { const u = [...p.existing_uses]; u[i] = { ...u[i], notes: e.target.value }; setP(prev => ({ ...prev, existing_uses: u })); }} placeholder="e.g. Operates 6am-3pm" className={inputCls} />
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => setP(prev => ({ ...prev, existing_uses: [...prev.existing_uses, { use: '', formal: true, notes: '' }] }))}
                  className="w-full py-2 bg-transparent border border-dashed border-ink-200 rounded text-ink-500 cursor-pointer text-[10px]"
                >
                  + Add existing use
                </button>
              </Section>

              <Section title="Historical Uses">
                {p.historical_uses.map((item, i) => (
                  <div key={i} className="bg-ink-100 border border-ink-200 rounded-md p-3 mb-2 relative">
                    {p.historical_uses.length > 1 && (
                      <button
                        onClick={() => setP(prev => ({ ...prev, historical_uses: prev.historical_uses.filter((_, j) => j !== i) }))}
                        className="absolute top-1.5 right-2 bg-transparent border-0 text-ink-400 cursor-pointer text-sm"
                      >
                        &times;
                      </button>
                    )}
                    <div className="mb-1.5">
                      <Label text="Use" />
                      <input value={item.use} onChange={e => { const u = [...p.historical_uses]; u[i] = { ...u[i], use: e.target.value }; setP(prev => ({ ...prev, historical_uses: u })); }} placeholder="e.g. Wholesale textile district" className={inputCls} />
                    </div>
                    <div className="mb-1.5">
                      <Label text="Period" />
                      <input value={item.period} onChange={e => { const u = [...p.historical_uses]; u[i] = { ...u[i], period: e.target.value }; setP(prev => ({ ...prev, historical_uses: u })); }} placeholder="e.g. 1950s-1990s" className={inputCls} />
                    </div>
                    <div>
                      <Label text="Notes" />
                      <input value={item.notes} onChange={e => { const u = [...p.historical_uses]; u[i] = { ...u[i], notes: e.target.value }; setP(prev => ({ ...prev, historical_uses: u })); }} placeholder="e.g. Remnant signage visible" className={inputCls} />
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => setP(prev => ({ ...prev, historical_uses: [...prev.historical_uses, { use: '', period: '', notes: '' }] }))}
                  className="w-full py-2 bg-transparent border border-dashed border-ink-200 rounded text-ink-500 cursor-pointer text-[10px]"
                >
                  + Add historical use
                </button>
              </Section>
            </TabsContent>

            {/* ── ARCHITECT'S READING ── */}
            <TabsContent value="reading" className="mt-0">
              <div className="bg-ink-100 border border-ink-200 rounded-md p-2.5 mb-4 text-[10px] text-amber-600 leading-relaxed">
                This section is explicitly your subjective reading. It is labeled as such in the translation pipeline.
              </div>
              <div className="mb-3">
                <Label text="Tensions" sub="What's in conflict?" />
                <textarea value={r.tensions} onChange={e => setR(prev => ({ ...prev, tensions: e.target.value }))} placeholder="Write freely." className={textareaCls} />
              </div>
              <div className="mb-3">
                <Label text="Spatial qualities" sub="Compression, openness, rhythm, noise, light, smell" />
                <textarea value={r.spatial_qualities} onChange={e => setR(prev => ({ ...prev, spatial_qualities: e.target.value }))} placeholder="Describe the embodied experience." className={textareaCls} />
              </div>
              <div className="mb-3">
                <Label text="Social dynamics" sub="Who is there, when, doing what? Who is absent?" />
                <textarea value={r.social_dynamics} onChange={e => setR(prev => ({ ...prev, social_dynamics: e.target.value }))} placeholder="Describe human patterns." className={textareaCls} />
              </div>
              <div>
                <Label text="Additional notes" sub="Hunches, questions, contradictions" />
                <textarea value={r.notes} onChange={e => setR(prev => ({ ...prev, notes: e.target.value }))} placeholder="Open field." className={textareaCls} />
              </div>
            </TabsContent>

            {/* ── SAVE ── */}
            <TabsContent value="export" className="mt-0">
              <div className="mb-4">
                <pre className="bg-ink-100 border border-ink-200 rounded-md p-3 text-[10px] text-ink-600 leading-relaxed overflow-auto max-h-[300px] whitespace-pre-wrap break-words">
                  {JSON.stringify(buildExport(), null, 2)}
                </pre>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSave}
                  className={`flex-1 h-auto py-2.5 text-xs font-semibold border-0 ${saved ? 'bg-green-600 hover:bg-green-600 text-white' : 'bg-primary hover:bg-primary/85 text-white'}`}
                >
                  {saved ? 'Saved!' : 'Save as Active Context'}
                </Button>
                <Button
                  onClick={handleClear}
                  className="h-auto py-2.5 px-4 text-xs bg-destructive/10 hover:bg-destructive/20 text-destructive border-0"
                >
                  Clear
                </Button>
              </div>
              <div className="mt-2 text-[9px] text-ink-400 leading-relaxed">
                Saved context is stored in localStorage and automatically injected into v2 translations.
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};
