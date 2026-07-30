import type { SiteContextData } from '../storage/siteContext';

/**
 * A short human name for a site, derived from its geocoded address:
 * "street + number, locality" — e.g. "Dizengoff Street 100, Tel Aviv-Yafo".
 *
 * Nominatim display_names arrive as a long comma chain, often with a bare
 * house number as the first segment ("100, Dizengoff Street, Tel Aviv-Yafo,
 * Tel Aviv District, 6433222, Israel"); the number is folded into the street
 * and the first digit-free segment after it serves as the locality. Falls
 * back to the context's own site_name, then to ''.
 */
export function shortSiteName(context: SiteContextData | null): string {
  if (!context) return '';
  const fallback = context.site_name?.trim() ?? '';
  const address = context.quantitative?.location?.address?.trim();
  if (!address) return fallback;

  const parts = address.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return fallback;

  let street = parts[0];
  let rest = parts.slice(1);
  if (/^\d+[a-z]?$/i.test(street) && rest.length > 0) {
    street = `${rest[0]} ${street}`;
    rest = rest.slice(1);
  }

  const locality = rest.find(p => !/\d/.test(p));
  return locality ? `${street}, ${locality}` : street;
}
