import React, { useState, useEffect, useCallback } from 'react';
import {
  getActiveSiteContext,
  setActiveSiteContext,
  clearActiveSiteContext,
  SiteContextData,
} from '../../lib/storage/siteContext';

// ---------------------------------------------------------------------------
// Embedded SunCalc (no dependency needed)
// ---------------------------------------------------------------------------

const SunCalc = (() => {
  const rad = Math.PI / 180;
  const dayMs = 1000 * 60 * 60 * 24;
  const J1970 = 2440588, J2000 = 2451545;
  const toJulian = (d: Date) => d.valueOf() / dayMs - 0.5 + J1970;
  const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * dayMs);
  const toDays = (d: Date) => toJulian(d) - J2000;
  const e = rad * 23.4397;
  const rightAscension = (l: number, b: number) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const declination = (l: number, b: number) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  const azimuthFn = (H: number, phi: number, dec: number) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  const altitudeFn = (H: number, phi: number, dec: number) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const siderealTime = (d: number, lw: number) => rad * (280.16 + 360.9856235 * d) - lw;
  const solarMeanAnomaly = (d: number) => rad * (357.5291 + 0.98560028 * d);
  const eclipticLongitude = (M: number) => { const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)); return M + C + rad * 102.9372 + Math.PI; };
  const sunCoords = (d: number) => { const M = solarMeanAnomaly(d); const L = eclipticLongitude(M); return { dec: declination(L, 0), ra: rightAscension(L, 0) }; };
  const julianCycle = (d: number, lw: number) => Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const approxTransit = (Ht: number, lw: number, n: number) => 0.0009 + (Ht + lw) / (2 * Math.PI) + n;
  const solarTransitJ = (ds: number, M: number, L: number) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const hourAngle = (h: number, phi: number, d: number) => Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));
  const getSetJ = (h: number, lw: number, phi: number, dec: number, n: number, M: number, L: number) => { const w = hourAngle(h, phi, dec); return solarTransitJ(approxTransit(w, lw, n), M, L); };

  return {
    getPosition(date: Date, lat: number, lng: number) {
      const lw = rad * -lng, phi = rad * lat, d = toDays(date), c = sunCoords(d);
      const H = siderealTime(d, lw) - c.ra;
      return { azimuth: azimuthFn(H, phi, c.dec) / rad + 180, altitude: altitudeFn(H, phi, c.dec) / rad };
    },
    getTimes(date: Date, lat: number, lng: number) {
      const lw = rad * -lng, phi = rad * lat, d = toDays(date);
      const n = julianCycle(d, lw), ds = approxTransit(0, lw, n);
      const M = solarMeanAnomaly(d), L = eclipticLongitude(M);
      const Jnoon = solarTransitJ(ds, M, L), dec = sunCoords(d).dec;
      try { const Jset = getSetJ(-0.833 * rad, lw, phi, dec, n, M, L); return { sunrise: fromJulian(Jnoon - (Jset - Jnoon)), sunset: fromJulian(Jset), solarNoon: fromJulian(Jnoon) }; }
      catch { return { sunrise: null, sunset: null, solarNoon: fromJulian(Jnoon) }; }
    },
    getDaylightHours(date: Date, lat: number, lng: number) {
      const t = this.getTimes(date, lat, lng);
      return (t.sunrise && t.sunset) ? ((t.sunset as any) - (t.sunrise as any)) / 3600000 : null;
    },
    getPrimaryExposure(lat: number, lng: number) {
      const summer = new Date(2026, 5, 21), winter = new Date(2026, 11, 21);
      const sNoon = this.getPosition(new Date(2026, 5, 21, 12), lat, lng);
      const wNoon = this.getPosition(new Date(2026, 11, 21, 12), lat, lng);
      const azToDir = (az: number) => ['N','NE','E','SE','S','SW','W','NW'][Math.round(az / 45) % 8];
      return {
        summer_noon_alt: sNoon.altitude.toFixed(1), summer_noon_az: azToDir(sNoon.azimuth),
        winter_noon_alt: wNoon.altitude.toFixed(1), winter_noon_az: azToDir(wNoon.azimuth),
        summer_daylight: this.getDaylightHours(summer, lat, lng)?.toFixed(1),
        winter_daylight: this.getDaylightHours(winter, lat, lng)?.toFixed(1),
      };
    },
  };
})();

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '6px 8px',
  fontFamily: 'inherit', fontSize: 11, color: '#e0e0e0',
  background: '#1e293b', border: '1px solid #334155', borderRadius: 4,
  outline: 'none',
};

const textarea: React.CSSProperties = {
  ...input, minHeight: 60, resize: 'vertical', lineHeight: 1.5,
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const Label: React.FC<{ text: string; sub?: string }> = ({ text, sub }) => (
  <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
    {text}
    {sub && <span style={{ display: 'block', fontWeight: 400, fontSize: 9, color: '#64748b', marginTop: 1 }}>{sub}</span>}
  </label>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginTop: 16 }}>
    <div style={{ fontSize: 10, fontWeight: 600, color: '#22d3ee', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #334155', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>{title}</div>
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type Tab = 'quantitative' | 'programmatic' | 'reading' | 'export';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'quantitative', label: 'Quantitative' },
  { id: 'programmatic', label: 'Programmatic' },
  { id: 'reading', label: "Architect's Reading" },
  { id: 'export', label: 'Save' },
];

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
  const [tab, setTab] = useState<Tab>('quantitative');
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
      const s = SunCalc.getPrimaryExposure(lat, lng);
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

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b',
        width: '90vw', maxWidth: 640, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Topological Translation</div>
            <h2 style={{ color: 'white', fontSize: 16, margin: '4px 0 0', fontWeight: 600 }}>Site Context Curator</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
        </div>

        {/* Site name */}
        <div style={{ padding: '8px 20px', borderBottom: '1px solid #1e293b' }}>
          <input
            value={siteName}
            onChange={e => setSiteName(e.target.value)}
            placeholder="Site name..."
            style={{ ...input, background: 'transparent', border: 'none', borderBottom: '1px solid #334155', borderRadius: 0, fontSize: 13, fontWeight: 500, color: '#22d3ee', padding: '4px 0' }}
          />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1e293b' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: '10px 8px', fontSize: 10, fontWeight: tab === t.id ? 600 : 400,
                background: tab === t.id ? '#1e293b' : 'transparent',
                borderBottom: tab === t.id ? '2px solid #22d3ee' : '2px solid transparent',
                color: tab === t.id ? '#e2e8f0' : '#64748b',
                border: 'none', borderTop: 'none', cursor: 'pointer',
                letterSpacing: '0.05em', textTransform: 'uppercase' as const,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 24px' }}>

          {/* ── QUANTITATIVE ── */}
          {tab === 'quantitative' && (
            <div>
              <Section title="Location">
                <div style={{ marginBottom: 8 }}>
                  <Label text="Address / Site name" />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={q.location.address} onChange={e => upQ('location', 'address', e.target.value)} placeholder="e.g. Neve Sha'anan & Levinsky, Tel Aviv" style={{ ...input, flex: 1 }} />
                    <button onClick={geocode} disabled={geocoding} style={{ padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: 4, color: geocoding ? '#475569' : '#22d3ee', fontSize: 10, cursor: geocoding ? 'wait' : 'pointer', whiteSpace: 'nowrap' as const }}>
                      {geocoding ? '...' : 'GEOCODE'}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div><Label text="Latitude" /><input value={q.location.lat} onChange={e => upQ('location', 'lat', e.target.value)} placeholder="32.0853" style={input} /></div>
                  <div><Label text="Longitude" /><input value={q.location.lng} onChange={e => upQ('location', 'lng', e.target.value)} placeholder="34.7818" style={input} /></div>
                </div>
              </Section>

              <Section title="Sun & Wind">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <button onClick={() => setAutoSun(!autoSun)} style={{ padding: '4px 8px', background: autoSun ? '#1e3a2f' : '#1e293b', border: `1px solid ${autoSun ? '#22c55e' : '#334155'}`, borderRadius: 4, color: autoSun ? '#22c55e' : '#64748b', fontSize: 9, cursor: 'pointer' }}>
                    {autoSun ? 'Auto sun ON' : 'Auto sun OFF'}
                  </button>
                  {sunOk && <span style={{ fontSize: 9, color: '#22c55e' }}>computed</span>}
                </div>
                <div style={{ marginBottom: 8 }}><Label text="Primary sun exposure" /><input value={q.sun.primary_exposure} onChange={e => upQ('sun', 'primary_exposure', e.target.value)} placeholder="e.g. West-facing, intense afternoon" style={{ ...input, background: sunOk && autoSun ? '#0f1d15' : undefined }} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div><Label text="Daylight (winter)" /><input value={q.sun.shadow_hours_winter} onChange={e => upQ('sun', 'shadow_hours_winter', e.target.value)} placeholder="~9.5h" style={{ ...input, background: sunOk && autoSun ? '#0f1d15' : undefined }} /></div>
                  <div><Label text="Daylight (summer)" /><input value={q.sun.shadow_hours_summer} onChange={e => upQ('sun', 'shadow_hours_summer', e.target.value)} placeholder="~14.3h" style={{ ...input, background: sunOk && autoSun ? '#0f1d15' : undefined }} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><Label text="Dominant wind" /><input value={q.wind.dominant_direction} onChange={e => upQ('wind', 'dominant_direction', e.target.value)} placeholder="NW sea breeze" style={input} /></div>
                  <div><Label text="Wind intensity" /><input value={q.wind.intensity} onChange={e => upQ('wind', 'intensity', e.target.value)} placeholder="moderate" style={input} /></div>
                </div>
              </Section>

              <Section title="Transit & Movement">
                <div style={{ marginBottom: 8 }}><Label text="Primary movement mode" /><input value={q.transit.primary_mode} onChange={e => upQ('transit', 'primary_mode', e.target.value)} placeholder="e.g. Heavily pedestrian" style={input} /></div>
                <div style={{ marginBottom: 8 }}><Label text="Transit stops nearby" /><input value={q.transit.bus_stops_nearby} onChange={e => upQ('transit', 'bus_stops_nearby', e.target.value)} placeholder="e.g. 3 bus stops within 200m" style={input} /></div>
                <div><Label text="Walkability notes" /><textarea value={q.transit.walkability_notes} onChange={e => upQ('transit', 'walkability_notes', e.target.value)} placeholder="e.g. Narrow sidewalks, market spills into street" style={textarea} /></div>
              </Section>

              <Section title="Morphology & Typology">
                <div style={{ marginBottom: 8 }}><Label text="Typology" sub="Describe, don't categorize" /><textarea value={q.morphology.typology} onChange={e => upQ('morphology', 'typology', e.target.value)} placeholder="e.g. Dense urban grid, Bauhaus 3-4 story" style={textarea} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div><Label text="Street width" /><input value={q.morphology.street_width} onChange={e => upQ('morphology', 'street_width', e.target.value)} placeholder="8m" style={input} /></div>
                  <div><Label text="Dominant height" /><input value={q.morphology.dominant_height} onChange={e => upQ('morphology', 'dominant_height', e.target.value)} placeholder="12-15m / 4 stories" style={input} /></div>
                </div>
                <div style={{ marginBottom: 8 }}><Label text="Lot dimensions" /><input value={q.morphology.lot_dimensions} onChange={e => upQ('morphology', 'lot_dimensions', e.target.value)} placeholder="200-400 sqm" style={input} /></div>
                <div style={{ marginBottom: 8 }}><Label text="Topography" /><input value={q.morphology.topography} onChange={e => upQ('morphology', 'topography', e.target.value)} placeholder="Flat" style={input} /></div>
                <div><Label text="Dominant directionality" sub="Strong axis — street, slope, wind, view" /><input value={q.morphology.dominant_directionality} onChange={e => upQ('morphology', 'dominant_directionality', e.target.value)} placeholder="e.g. Strong N-S along Levinsky" style={input} /></div>
              </Section>
            </div>
          )}

          {/* ── PROGRAMMATIC ── */}
          {tab === 'programmatic' && (
            <div>
              <Section title="Existing Uses">
                {p.existing_uses.map((item, i) => (
                  <div key={i} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: 12, marginBottom: 8, position: 'relative' }}>
                    {p.existing_uses.length > 1 && (
                      <button onClick={() => setP(prev => ({ ...prev, existing_uses: prev.existing_uses.filter((_, j) => j !== i) }))} style={{ position: 'absolute', top: 6, right: 8, background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14 }}>&times;</button>
                    )}
                    <div style={{ marginBottom: 6 }}><Label text="Use" /><input value={item.use} onChange={e => { const u = [...p.existing_uses]; u[i] = { ...u[i], use: e.target.value }; setP(prev => ({ ...prev, existing_uses: u })); }} placeholder="e.g. Street-level spice market" style={input} /></div>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
                      <label style={{ fontSize: 10, color: item.formal ? '#22c55e' : '#64748b', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input type="radio" name={`formal-${i}`} checked={item.formal} onChange={() => { const u = [...p.existing_uses]; u[i] = { ...u[i], formal: true }; setP(prev => ({ ...prev, existing_uses: u })); }} style={{ accentColor: '#22c55e' }} />Formal
                      </label>
                      <label style={{ fontSize: 10, color: !item.formal ? '#ef4444' : '#64748b', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input type="radio" name={`formal-${i}`} checked={!item.formal} onChange={() => { const u = [...p.existing_uses]; u[i] = { ...u[i], formal: false }; setP(prev => ({ ...prev, existing_uses: u })); }} style={{ accentColor: '#ef4444' }} />Informal
                      </label>
                    </div>
                    <div><Label text="Notes" /><input value={item.notes} onChange={e => { const u = [...p.existing_uses]; u[i] = { ...u[i], notes: e.target.value }; setP(prev => ({ ...prev, existing_uses: u })); }} placeholder="e.g. Operates 6am-3pm" style={input} /></div>
                  </div>
                ))}
                <button onClick={() => setP(prev => ({ ...prev, existing_uses: [...prev.existing_uses, { use: '', formal: true, notes: '' }] }))} style={{ width: '100%', padding: 8, background: 'none', border: '1px dashed #334155', borderRadius: 4, color: '#64748b', cursor: 'pointer', fontSize: 10 }}>+ Add existing use</button>
              </Section>

              <Section title="Historical Uses">
                {p.historical_uses.map((item, i) => (
                  <div key={i} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: 12, marginBottom: 8, position: 'relative' }}>
                    {p.historical_uses.length > 1 && (
                      <button onClick={() => setP(prev => ({ ...prev, historical_uses: prev.historical_uses.filter((_, j) => j !== i) }))} style={{ position: 'absolute', top: 6, right: 8, background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14 }}>&times;</button>
                    )}
                    <div style={{ marginBottom: 6 }}><Label text="Use" /><input value={item.use} onChange={e => { const u = [...p.historical_uses]; u[i] = { ...u[i], use: e.target.value }; setP(prev => ({ ...prev, historical_uses: u })); }} placeholder="e.g. Wholesale textile district" style={input} /></div>
                    <div style={{ marginBottom: 6 }}><Label text="Period" /><input value={item.period} onChange={e => { const u = [...p.historical_uses]; u[i] = { ...u[i], period: e.target.value }; setP(prev => ({ ...prev, historical_uses: u })); }} placeholder="e.g. 1950s-1990s" style={input} /></div>
                    <div><Label text="Notes" /><input value={item.notes} onChange={e => { const u = [...p.historical_uses]; u[i] = { ...u[i], notes: e.target.value }; setP(prev => ({ ...prev, historical_uses: u })); }} placeholder="e.g. Remnant signage visible" style={input} /></div>
                  </div>
                ))}
                <button onClick={() => setP(prev => ({ ...prev, historical_uses: [...prev.historical_uses, { use: '', period: '', notes: '' }] }))} style={{ width: '100%', padding: 8, background: 'none', border: '1px dashed #334155', borderRadius: 4, color: '#64748b', cursor: 'pointer', fontSize: 10 }}>+ Add historical use</button>
              </Section>
            </div>
          )}

          {/* ── ARCHITECT'S READING ── */}
          {tab === 'reading' && (
            <div>
              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: 10, marginBottom: 16, fontSize: 10, color: '#f59e0b', lineHeight: 1.5 }}>
                This section is explicitly your subjective reading. It is labeled as such in the translation pipeline.
              </div>
              <div style={{ marginBottom: 12 }}><Label text="Tensions" sub="What's in conflict?" /><textarea value={r.tensions} onChange={e => setR(prev => ({ ...prev, tensions: e.target.value }))} placeholder="Write freely." style={textarea} /></div>
              <div style={{ marginBottom: 12 }}><Label text="Spatial qualities" sub="Compression, openness, rhythm, noise, light, smell" /><textarea value={r.spatial_qualities} onChange={e => setR(prev => ({ ...prev, spatial_qualities: e.target.value }))} placeholder="Describe the embodied experience." style={textarea} /></div>
              <div style={{ marginBottom: 12 }}><Label text="Social dynamics" sub="Who is there, when, doing what? Who is absent?" /><textarea value={r.social_dynamics} onChange={e => setR(prev => ({ ...prev, social_dynamics: e.target.value }))} placeholder="Describe human patterns." style={textarea} /></div>
              <div><Label text="Additional notes" sub="Hunches, questions, contradictions" /><textarea value={r.notes} onChange={e => setR(prev => ({ ...prev, notes: e.target.value }))} placeholder="Open field." style={textarea} /></div>
            </div>
          )}

          {/* ── SAVE ── */}
          {tab === 'export' && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <pre style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, padding: 12, fontSize: 10, color: '#94a3b8', lineHeight: 1.5, overflow: 'auto', maxHeight: 300, whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const }}>
                  {JSON.stringify(buildExport(), null, 2)}
                </pre>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSave} style={{ flex: 1, padding: 10, background: saved ? '#22c55e' : '#065f46', border: 'none', borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  {saved ? 'Saved!' : 'Save as Active Context'}
                </button>
                <button onClick={handleClear} style={{ padding: '10px 16px', background: '#7f1d1d', border: 'none', borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 12 }}>
                  Clear
                </button>
              </div>
              <div style={{ marginTop: 8, fontSize: 9, color: '#475569', lineHeight: 1.5 }}>
                Saved context is stored in localStorage and automatically injected into v2 translations.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
