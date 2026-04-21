/**
 * Minimal embedded SunCalc implementation.
 *
 * Computes sun position and daylight hours for a given date + lat/lng, with
 * no external dependencies. Adapted from mourner/suncalc (BSD-2-Clause) —
 * only the subset we actually use.
 */

const rad = Math.PI / 180;
const dayMs = 1000 * 60 * 60 * 24;
const J1970 = 2440588;
const J2000 = 2451545;
const e = rad * 23.4397; // obliquity of the Earth

const toJulian = (d: Date) => d.valueOf() / dayMs - 0.5 + J1970;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * dayMs);
const toDays = (d: Date) => toJulian(d) - J2000;

const rightAscension = (l: number, b: number) =>
  Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const declination = (l: number, b: number) =>
  Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const azimuthFn = (H: number, phi: number, dec: number) =>
  Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
const altitudeFn = (H: number, phi: number, dec: number) =>
  Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const siderealTime = (d: number, lw: number) => rad * (280.16 + 360.9856235 * d) - lw;
const solarMeanAnomaly = (d: number) => rad * (357.5291 + 0.98560028 * d);
const eclipticLongitude = (M: number) => {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + rad * 102.9372 + Math.PI;
};
const sunCoords = (d: number) => {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
};
const julianCycle = (d: number, lw: number) => Math.round(d - 0.0009 - lw / (2 * Math.PI));
const approxTransit = (Ht: number, lw: number, n: number) => 0.0009 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds: number, M: number, L: number) =>
  J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h: number, phi: number, d: number) =>
  Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));
const getSetJ = (h: number, lw: number, phi: number, dec: number, n: number, M: number, L: number) => {
  const w = hourAngle(h, phi, dec);
  return solarTransitJ(approxTransit(w, lw, n), M, L);
};

export interface SunPosition {
  azimuth: number;    // degrees, 0 = N, 90 = E
  altitude: number;   // degrees above horizon
}

export interface SunTimes {
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
}

export interface PrimaryExposure {
  summer_noon_alt: string;
  summer_noon_az: string;
  winter_noon_alt: string;
  winter_noon_az: string;
  summer_daylight: string | undefined;
  winter_daylight: string | undefined;
}

export function getPosition(date: Date, lat: number, lng: number): SunPosition {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  return {
    azimuth: azimuthFn(H, phi, c.dec) / rad + 180,
    altitude: altitudeFn(H, phi, c.dec) / rad,
  };
}

export function getTimes(date: Date, lat: number, lng: number): SunTimes {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  const Jnoon = solarTransitJ(ds, M, L);
  const dec = sunCoords(d).dec;
  try {
    const Jset = getSetJ(-0.833 * rad, lw, phi, dec, n, M, L);
    return {
      sunrise: fromJulian(Jnoon - (Jset - Jnoon)),
      sunset: fromJulian(Jset),
      solarNoon: fromJulian(Jnoon),
    };
  } catch {
    return { sunrise: null, sunset: null, solarNoon: fromJulian(Jnoon) };
  }
}

export function getDaylightHours(date: Date, lat: number, lng: number): number | null {
  const t = getTimes(date, lat, lng);
  if (!t.sunrise || !t.sunset) return null;
  return (t.sunset.valueOf() - t.sunrise.valueOf()) / 3600000;
}

const azToDir = (az: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8];

/**
 * Summary of sun exposure at a site, expressed as summer/winter solstice
 * noon altitude + direction, plus total daylight hours on each solstice.
 * Uses the current calendar year for the solstices.
 */
export function getPrimaryExposure(lat: number, lng: number): PrimaryExposure {
  const year = new Date().getFullYear();
  const summer = new Date(year, 5, 21);
  const winter = new Date(year, 11, 21);
  const sNoon = getPosition(new Date(year, 5, 21, 12), lat, lng);
  const wNoon = getPosition(new Date(year, 11, 21, 12), lat, lng);
  return {
    summer_noon_alt: sNoon.altitude.toFixed(1),
    summer_noon_az: azToDir(sNoon.azimuth),
    winter_noon_alt: wNoon.altitude.toFixed(1),
    winter_noon_az: azToDir(wNoon.azimuth),
    summer_daylight: getDaylightHours(summer, lat, lng)?.toFixed(1),
    winter_daylight: getDaylightHours(winter, lat, lng)?.toFixed(1),
  };
}
