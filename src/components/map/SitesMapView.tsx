/**
 * SitesMapView — the "My sites" layer of the Map tab.
 *
 * Full-bleed Leaflet map plotting every saved Site (across all of the
 * signed-in user's Projects) at the coordinates stored in its site context.
 * Clicking a marker opens a card listing that site's compositions, each
 * loadable (with an inline confirm — loading replaces the current work).
 * Sites whose stored context has no coordinates surface in a "without
 * location" list, from which a location can be assigned by clicking the map
 * or searching an address.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuthContext } from '../../contexts/AuthContext';
import { useAppStore } from '../../store/useAppStore';
import { useToastStore } from '../../store/useToastStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { loadSitePins, isLocated, SitePin } from '../../lib/projects/sitePins';
import { listCompositions, updateSite } from '../../lib/projects/firestore';
import { restoreComposition } from '../../lib/projects/composition';
import { buildSiteContextAt } from '../../lib/siteContext/mapSiteContext';
import { setActiveSiteContext } from '../../lib/storage/siteContext';
import type { CompositionDoc } from '../../lib/projects/types';
import { Button } from '@/components/ui/button';

const DEFAULT_CENTER: [number, number] = [32.08, 34.78];
const DEFAULT_ZOOM = 13;
const PLACEMENT_RADIUS_METERS = 500;

const ESRI_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

function pinKey(pin: SitePin): string {
  return `${pin.projectId}:${pin.siteId}`;
}

function siteIcon(selected: boolean): L.DivIcon {
  const size = selected ? 18 : 14;
  const color = selected ? '#c4b5fd' : '#8b5cf6';
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid #fff;transform:rotate(45deg);border-radius:3px;box-shadow:0 0 6px rgba(0,0,0,.6)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const placementIcon = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;background:#f59e0b;border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px rgba(0,0,0,.6)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function compositionThumb(c: CompositionDoc): string | null {
  const imgs = c.data?.encode?.images;
  if (!imgs || imgs.length === 0) return null;
  return (imgs.find((i) => i.isPrimary) ?? imgs[0]).thumbnailDataUrl;
}

export const SitesMapView: React.FC = () => {
  const { user } = useAuthContext();
  const setActiveMode = useAppStore((s) => s.setActiveMode);
  const showToast = useToastStore((s) => s.showToast);
  const isMobile = useIsMobile();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const placementMarkerRef = useRef<L.Marker | null>(null);
  const fittedRef = useRef(false);

  const [pins, setPins] = useState<SitePin[]>([]);
  const [pinsLoading, setPinsLoading] = useState(true);
  const [pinsError, setPinsError] = useState<string | null>(null);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [compositions, setCompositions] = useState<CompositionDoc[] | null>(null);
  const [compsLoading, setCompsLoading] = useState(false);
  const [confirmLoadId, setConfirmLoadId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const [unlocatedOpen, setUnlocatedOpen] = useState(false);
  const [placingKey, setPlacingKey] = useState<string | null>(null);
  const [pendingPos, setPendingPos] = useState<{ lat: number; lng: number } | null>(null);
  const [pendingAddress, setPendingAddress] = useState('');
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeSearching, setPlaceSearching] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);

  const located = useMemo(() => pins.filter(isLocated), [pins]);
  const unlocated = useMemo(() => pins.filter((p) => !isLocated(p)), [pins]);
  const selectedPin = useMemo(
    () => located.find((p) => pinKey(p) === selectedKey) ?? null,
    [located, selectedKey],
  );
  const placingPin = useMemo(
    () => unlocated.find((p) => pinKey(p) === placingKey) ?? null,
    [unlocated, placingKey],
  );

  // Latest-state click handler, reachable from the one listener bound at init.
  const mapClickRef = useRef<(e: L.LeafletMouseEvent) => void>(() => {});
  mapClickRef.current = (e) => {
    if (placingKey) {
      setPendingPos({ lat: e.latlng.lat, lng: e.latlng.lng });
      setPendingAddress(`${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`);
    } else {
      setSelectedKey(null);
    }
  };

  const refreshPins = async (uid: string) => {
    setPinsLoading(true);
    setPinsError(null);
    try {
      setPins(await loadSitePins(uid));
    } catch (err) {
      console.error('Failed to load site pins:', err);
      setPinsError('Could not load your projects — check your connection and try again.');
    } finally {
      setPinsLoading(false);
    }
  };

  // Map init (once).
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
    });

    const esriLayer = L.tileLayer(ESRI_IMAGERY, {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19,
    }).addTo(map);

    const osmLayer = L.tileLayer(OSM_TILES, {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    });

    let usingOsm = false;
    esriLayer.on('tileerror', () => {
      if (!usingOsm) {
        usingOsm = true;
        map.removeLayer(esriLayer);
        osmLayer.addTo(map);
      }
    });

    map.on('click', (e: L.LeafletMouseEvent) => mapClickRef.current(e));

    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      circleRef.current = null;
      placementMarkerRef.current = null;
    };
  }, []);

  // Initial pins load.
  useEffect(() => {
    if (user) void refreshPins(user.uid);
  }, [user]);

  // Fit the map to the located pins once, after the first successful load.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || pinsLoading || fittedRef.current) return;
    fittedRef.current = true;
    if (located.length === 1) {
      map.setView([located[0].lat!, located[0].lng!], 15);
    } else if (located.length > 1) {
      map.fitBounds(L.latLngBounds(located.map((p) => [p.lat!, p.lng!] as [number, number])), {
        padding: [60, 60],
        maxZoom: 15,
      });
    }
  }, [pinsLoading, located]);

  // Markers reflect the pin list + selection.
  useEffect(() => {
    const group = markersRef.current;
    if (!group) return;
    group.clearLayers();
    for (const pin of located) {
      const key = pinKey(pin);
      const marker = L.marker([pin.lat!, pin.lng!], { icon: siteIcon(key === selectedKey) });
      marker.bindTooltip(pin.siteName, { direction: 'top', offset: [0, -10] });
      marker.on('click', () => {
        setPlacingKey(null);
        setPendingPos(null);
        setSelectedKey((prev) => (prev === key ? null : key));
      });
      marker.addTo(group);
    }
  }, [located, selectedKey]);

  // Radius circle for the selected site.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (circleRef.current) {
      map.removeLayer(circleRef.current);
      circleRef.current = null;
    }
    if (selectedPin) {
      circleRef.current = L.circle([selectedPin.lat!, selectedPin.lng!], {
        radius: selectedPin.radiusMeters,
        color: '#8b5cf6',
        fillColor: '#8b5cf6',
        fillOpacity: 0.08,
        weight: 1,
      }).addTo(map);
      map.flyTo([selectedPin.lat!, selectedPin.lng!], Math.max(map.getZoom(), 15), { duration: 0.6 });
    }
  }, [selectedPin]);

  // Amber marker for the pending placement position.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!placingKey || !pendingPos) {
      if (placementMarkerRef.current) {
        map.removeLayer(placementMarkerRef.current);
        placementMarkerRef.current = null;
      }
      return;
    }
    if (placementMarkerRef.current) {
      placementMarkerRef.current.setLatLng([pendingPos.lat, pendingPos.lng]);
    } else {
      placementMarkerRef.current = L.marker([pendingPos.lat, pendingPos.lng], {
        icon: placementIcon,
      }).addTo(map);
    }
  }, [placingKey, pendingPos]);

  // Compositions for the selected site.
  useEffect(() => {
    setConfirmLoadId(null);
    if (!selectedPin) {
      setCompositions(null);
      return;
    }
    let cancelled = false;
    setCompsLoading(true);
    listCompositions(selectedPin.projectId, selectedPin.siteId)
      .then((list) => { if (!cancelled) setCompositions(list); })
      .catch((err) => {
        console.error('Failed to load compositions:', err);
        if (!cancelled) {
          setCompositions([]);
          showToast('Could not load compositions', 'error');
        }
      })
      .finally(() => { if (!cancelled) setCompsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const handleLoadComposition = async (c: CompositionDoc) => {
    setRestoring(true);
    try {
      const { landingMode } = await restoreComposition(c.data);
      setActiveMode(landingMode);
      showToast('Composition loaded', 'success');
    } catch (err) {
      console.error('Load failed:', err);
      showToast('Load failed — snapshot may be incompatible', 'error');
    } finally {
      setRestoring(false);
      setConfirmLoadId(null);
    }
  };

  const handleSetActiveSite = () => {
    if (!selectedPin?.siteContext) return;
    setActiveSiteContext(selectedPin.siteContext);
    showToast('Site set as active context', 'success');
  };

  const startPlacing = (pin: SitePin) => {
    setSelectedKey(null);
    setPendingPos(null);
    setPendingAddress('');
    setPlaceQuery('');
    setPlacingKey(pinKey(pin));
    setUnlocatedOpen(false);
  };

  const cancelPlacing = () => {
    setPlacingKey(null);
    setPendingPos(null);
    setPendingAddress('');
    setPlaceQuery('');
  };

  const handlePlaceSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = placeQuery.trim();
    if (!q) return;
    setPlaceSearching(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Geocoding failed (${res.status})`);
      const lat = parseFloat(data.lat);
      const lng = parseFloat(data.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) throw new Error('Invalid coordinates returned');
      setPendingPos({ lat, lng });
      setPendingAddress(data.display_name || q);
      mapRef.current?.flyTo([lat, lng], 15, { duration: 0.6 });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Address search failed', 'error');
    } finally {
      setPlaceSearching(false);
    }
  };

  const handleSaveLocation = async () => {
    if (!placingPin || !pendingPos || !user) return;
    setSavingLocation(true);
    try {
      // Merge over the site's own stored context (if any) so an existing
      // analysis is kept — only the location block (+ sun data) changes.
      const ctx = buildSiteContextAt(
        pendingPos.lat,
        pendingPos.lng,
        pendingAddress || `${pendingPos.lat.toFixed(5)}, ${pendingPos.lng.toFixed(5)}`,
        PLACEMENT_RADIUS_METERS,
        placingPin.siteContext,
      );
      await updateSite(placingPin.projectId, placingPin.siteId, ctx);
      showToast(`Location saved for "${placingPin.siteName}"`, 'success');
      cancelPlacing();
      await refreshPins(user.uid);
    } catch (err) {
      console.error('Failed to save site location:', err);
      showToast('Could not save location', 'error');
    } finally {
      setSavingLocation(false);
    }
  };

  const rootClass = isMobile
    ? 'absolute inset-0 bg-slate-950'
    : 'absolute top-[42px] left-0 right-0 bottom-0 bg-slate-950';

  return (
    <div className={rootClass}>
      <div ref={mapContainerRef} className="absolute inset-0" />

      {/* Status line: loading / error / empty */}
      {(pinsLoading || pinsError || (!pinsLoading && pins.length === 0)) && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] rounded-md border border-slate-700 px-3 py-2 text-[11px] text-slate-200 shadow-xl max-w-[85%] text-center"
          style={{ background: 'rgba(15, 23, 42, 0.94)' }}
        >
          {pinsLoading
            ? 'Loading your sites…'
            : pinsError
              ? pinsError
              : 'No saved sites yet. Sites you save to Projects appear here on the map.'}
        </div>
      )}

      {/* Placement banner */}
      {placingPin && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-[1001] w-[320px] max-w-[92%] rounded-md border border-amber-600/60 p-3 shadow-xl flex flex-col gap-2"
          style={{ background: 'rgba(15, 23, 42, 0.96)' }}
        >
          <div className="text-[11px] text-amber-300 font-semibold">
            Placing “{placingPin.siteName}”
          </div>
          <div className="text-[10px] text-slate-400">
            Click the map to drop a pin, or search an address.
          </div>
          <form onSubmit={handlePlaceSearch} className="flex gap-1.5">
            <input
              type="text"
              value={placeQuery}
              onChange={(e) => setPlaceQuery(e.target.value)}
              placeholder="Search address…"
              className="flex-1 min-w-0 box-border px-2 py-1.5 text-[11px] text-slate-200 bg-slate-800 border border-slate-700 rounded outline-none focus:border-amber-700"
            />
            <Button
              type="submit"
              disabled={placeSearching || !placeQuery.trim()}
              className="h-auto py-1.5 px-2.5 text-[10px] bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700"
            >
              {placeSearching ? '…' : 'Search'}
            </Button>
          </form>
          {pendingPos && (
            <div className="text-[10px] text-slate-300 truncate">{pendingAddress}</div>
          )}
          <div className="flex gap-1.5">
            <Button
              onClick={handleSaveLocation}
              disabled={!pendingPos || savingLocation}
              className="flex-1 h-auto py-1.5 text-[11px] bg-amber-700 hover:bg-amber-600 text-white border-0 disabled:opacity-50"
            >
              {savingLocation ? 'Saving…' : 'Save location'}
            </Button>
            <Button
              onClick={cancelPlacing}
              disabled={savingLocation}
              className="h-auto py-1.5 px-3 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Selected site card */}
      {selectedPin && (
        <div
          className="absolute top-3 left-3 z-[1000] w-[300px] max-w-[88%] max-h-[70%] rounded-md border border-slate-700 shadow-2xl flex flex-col"
          style={{ background: 'rgba(15, 23, 42, 0.96)' }}
        >
          <div className="px-3 py-2.5 border-b border-slate-800">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12px] text-slate-100 font-semibold truncate">
                  {selectedPin.siteName}
                </div>
                <div className="text-[10px] text-slate-500 truncate">{selectedPin.projectName}</div>
              </div>
              <button
                onClick={() => setSelectedKey(null)}
                className="text-slate-400 hover:text-slate-200 text-[13px] cursor-pointer bg-transparent border-0 shrink-0"
              >
                ✕
              </button>
            </div>
            {selectedPin.address && (
              <div className="text-[10px] text-slate-400 mt-1 leading-snug">{selectedPin.address}</div>
            )}
            <Button
              onClick={handleSetActiveSite}
              className="mt-2 w-full h-auto py-1.5 text-[10px] bg-emerald-900 hover:bg-emerald-800 text-white border-0"
            >
              Set as active site context
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2.5 flex flex-col gap-1.5">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              Compositions
            </div>
            {compsLoading && <div className="text-[11px] text-slate-500">Loading…</div>}
            {!compsLoading && compositions && compositions.length === 0 && (
              <div className="text-[11px] text-slate-500">No saved compositions on this site.</div>
            )}
            {!compsLoading && compositions?.map((c) => {
              const thumb = compositionThumb(c);
              const confirming = confirmLoadId === c.id;
              return (
                <div
                  key={c.id}
                  className="rounded-md border border-slate-700/70 px-2.5 py-2 bg-slate-800/40 flex flex-col gap-1.5"
                >
                  <div className="flex items-center gap-2">
                    {thumb && (
                      <img
                        src={thumb}
                        alt=""
                        className="w-9 h-9 rounded object-cover border border-slate-700 shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-slate-200 truncate">{c.name}</div>
                      <div className="text-[10px] text-slate-500">Saved {fmtDate(c.updatedAt)}</div>
                    </div>
                    {!confirming && (
                      <button
                        onClick={() => setConfirmLoadId(c.id)}
                        disabled={restoring}
                        className="rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-[11px] px-2 py-1 cursor-pointer border-0 shrink-0"
                      >
                        Load
                      </button>
                    )}
                  </div>
                  {confirming && (
                    <div className="flex items-center gap-1.5">
                      <span className="flex-1 text-[10px] text-amber-300">Replaces current work.</span>
                      <button
                        onClick={() => handleLoadComposition(c)}
                        disabled={restoring}
                        className="rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-[10px] px-2 py-1 cursor-pointer border-0"
                      >
                        {restoring ? 'Loading…' : 'Load anyway'}
                      </button>
                      <button
                        onClick={() => setConfirmLoadId(null)}
                        disabled={restoring}
                        className="rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] px-2 py-1 cursor-pointer border border-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sites without location */}
      {unlocated.length > 0 && !placingPin && (
        <div className="absolute bottom-6 left-3 z-[1000] max-w-[88%]">
          {unlocatedOpen ? (
            <div
              className="w-[280px] rounded-md border border-slate-700 shadow-2xl flex flex-col max-h-[50vh]"
              style={{ background: 'rgba(15, 23, 42, 0.96)' }}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Sites without location
                </span>
                <button
                  onClick={() => setUnlocatedOpen(false)}
                  className="text-slate-400 hover:text-slate-200 text-[13px] cursor-pointer bg-transparent border-0"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
                {unlocated.map((pin) => (
                  <div
                    key={pinKey(pin)}
                    className="flex items-center gap-2 rounded-md border border-slate-700/70 px-2.5 py-2 bg-slate-800/40"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-slate-200 truncate">{pin.siteName}</div>
                      <div className="text-[10px] text-slate-500 truncate">{pin.projectName}</div>
                    </div>
                    <button
                      onClick={() => startPlacing(pin)}
                      className="rounded bg-amber-700 hover:bg-amber-600 text-white text-[11px] px-2 py-1 cursor-pointer border-0 shrink-0"
                    >
                      Place
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setUnlocatedOpen(true)}
              className="rounded-full border border-amber-700/70 px-3 py-1.5 text-[11px] text-amber-300 shadow-xl cursor-pointer"
              style={{ background: 'rgba(15, 23, 42, 0.94)' }}
            >
              {unlocated.length} site{unlocated.length === 1 ? '' : 's'} without location
            </button>
          )}
        </div>
      )}
    </div>
  );
};
