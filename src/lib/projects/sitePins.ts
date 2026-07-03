/**
 * Site pins — flattens the signed-in user's Projects → Sites hierarchy into a
 * single list the "My sites" map view can plot. A pin is "located" when its
 * stored site context carries parseable coordinates; otherwise it surfaces in
 * the map view's "sites without location" list, where a location can be
 * assigned after the fact.
 */
import type { ProjectDoc, SiteDoc } from './types';
import type { SiteContextData } from '../storage/siteContext';
import { listProjects, listSites } from './firestore';

const DEFAULT_RADIUS_METERS = 500;

export interface SitePin {
  projectId: string;
  projectName: string;
  siteId: string;
  siteName: string;
  /** Parsed coordinates; null when the stored context has none (or none parse). */
  lat: number | null;
  lng: number | null;
  address: string;
  radiusMeters: number;
  siteContext: SiteContextData | null;
  createdAt: number;
}

export function isLocated(pin: SitePin): pin is SitePin & { lat: number; lng: number } {
  return pin.lat !== null && pin.lng !== null;
}

/** Pure mapping from Firestore docs to a pin — parsing lives here so it's testable. */
export function toSitePin(project: ProjectDoc, site: SiteDoc): SitePin {
  const loc = site.siteContext?.quantitative?.location;
  const lat = loc ? parseFloat(loc.lat) : NaN;
  const lng = loc ? parseFloat(loc.lng) : NaN;
  const located = Number.isFinite(lat) && Number.isFinite(lng);
  const radius = parseInt(loc?.radius_meters || '', 10);

  return {
    projectId: project.id,
    projectName: project.name,
    siteId: site.id,
    siteName: site.name,
    lat: located ? lat : null,
    lng: located ? lng : null,
    address: loc?.address ?? '',
    radiusMeters: Number.isFinite(radius) ? radius : DEFAULT_RADIUS_METERS,
    siteContext: site.siteContext ?? null,
    createdAt: site.createdAt,
  };
}

/** All of the owner's sites across every project, flattened into pins. */
export async function loadSitePins(ownerId: string): Promise<SitePin[]> {
  const projects = await listProjects(ownerId);
  const perProject = await Promise.all(
    projects.map(async (p) => (await listSites(p.id)).map((s) => toSitePin(p, s))),
  );
  return perProject.flat();
}
