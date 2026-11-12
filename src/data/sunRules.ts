/*
 * Sunrise and sunset, worked out on the device from a city's position (the standard NOAA method).
 * Nothing is looked up online and no location permission is needed: the student picks a city, or
 * one is suggested from the device's time zone.
 */

export interface Place { name: string; lat: number; lon: number; zone?: string }

/** A short list of cities to choose from. The zone is only used to suggest a starting city. */
export const PLACES: Place[] = [
  { name: 'New York', lat: 40.71, lon: -74.01, zone: 'America/New_York' },
  { name: 'Trenton / Ewing, NJ', lat: 40.26, lon: -74.79 },
  { name: 'Boston', lat: 42.36, lon: -71.06 },
  { name: 'Philadelphia', lat: 39.95, lon: -75.17 },
  { name: 'Washington, DC', lat: 38.91, lon: -77.04 },
  { name: 'Atlanta', lat: 33.75, lon: -84.39 },
  { name: 'Miami', lat: 25.76, lon: -80.19 },
  { name: 'Toronto', lat: 43.65, lon: -79.38, zone: 'America/Toronto' },
  { name: 'Detroit', lat: 42.33, lon: -83.05, zone: 'America/Detroit' },
  { name: 'Chicago', lat: 41.88, lon: -87.63, zone: 'America/Chicago' },
  { name: 'Houston', lat: 29.76, lon: -95.37 },
  { name: 'Dallas', lat: 32.78, lon: -96.8 },
  { name: 'Minneapolis', lat: 44.98, lon: -93.27 },
  { name: 'Mexico City', lat: 19.43, lon: -99.13, zone: 'America/Mexico_City' },
  { name: 'Denver', lat: 39.74, lon: -104.99, zone: 'America/Denver' },
  { name: 'Phoenix', lat: 33.45, lon: -112.07, zone: 'America/Phoenix' },
  { name: 'Los Angeles', lat: 34.05, lon: -118.24, zone: 'America/Los_Angeles' },
  { name: 'San Francisco', lat: 37.77, lon: -122.42 },
  { name: 'Seattle', lat: 47.61, lon: -122.33 },
  { name: 'Vancouver', lat: 49.28, lon: -123.12, zone: 'America/Vancouver' },
  { name: 'Anchorage', lat: 61.22, lon: -149.9, zone: 'America/Anchorage' },
  { name: 'Honolulu', lat: 21.31, lon: -157.86, zone: 'Pacific/Honolulu' },
  { name: 'San Juan', lat: 18.47, lon: -66.11, zone: 'America/Puerto_Rico' },
  { name: 'Bogotá', lat: 4.71, lon: -74.07, zone: 'America/Bogota' },
  { name: 'Lima', lat: -12.05, lon: -77.04, zone: 'America/Lima' },
  { name: 'São Paulo', lat: -23.55, lon: -46.63, zone: 'America/Sao_Paulo' },
  { name: 'Buenos Aires', lat: -34.6, lon: -58.38, zone: 'America/Argentina/Buenos_Aires' },
  { name: 'London', lat: 51.51, lon: -0.13, zone: 'Europe/London' },
  { name: 'Dublin', lat: 53.35, lon: -6.26, zone: 'Europe/Dublin' },
  { name: 'Lisbon', lat: 38.72, lon: -9.14, zone: 'Europe/Lisbon' },
  { name: 'Madrid', lat: 40.42, lon: -3.7, zone: 'Europe/Madrid' },
  { name: 'Paris', lat: 48.86, lon: 2.35, zone: 'Europe/Paris' },
  { name: 'Amsterdam', lat: 52.37, lon: 4.9, zone: 'Europe/Amsterdam' },
  { name: 'Berlin', lat: 52.52, lon: 13.4, zone: 'Europe/Berlin' },
  { name: 'Rome', lat: 41.9, lon: 12.5, zone: 'Europe/Rome' },
  { name: 'Stockholm', lat: 59.33, lon: 18.07, zone: 'Europe/Stockholm' },
  { name: 'Warsaw', lat: 52.23, lon: 21.01, zone: 'Europe/Warsaw' },
  { name: 'Athens', lat: 37.98, lon: 23.73, zone: 'Europe/Athens' },
  { name: 'Istanbul', lat: 41.01, lon: 28.98, zone: 'Europe/Istanbul' },
  { name: 'Cairo', lat: 30.04, lon: 31.24, zone: 'Africa/Cairo' },
  { name: 'Lagos', lat: 6.52, lon: 3.38, zone: 'Africa/Lagos' },
  { name: 'Nairobi', lat: -1.29, lon: 36.82, zone: 'Africa/Nairobi' },
  { name: 'Johannesburg', lat: -26.2, lon: 28.05, zone: 'Africa/Johannesburg' },
  { name: 'Riyadh', lat: 24.71, lon: 46.68, zone: 'Asia/Riyadh' },
  { name: 'Dubai', lat: 25.2, lon: 55.27, zone: 'Asia/Dubai' },
  { name: 'Karachi', lat: 24.86, lon: 67.0, zone: 'Asia/Karachi' },
  { name: 'Mumbai', lat: 19.08, lon: 72.88 },
  { name: 'Delhi', lat: 28.61, lon: 77.21, zone: 'Asia/Kolkata' },
  { name: 'Bengaluru', lat: 12.97, lon: 77.59 },
  { name: 'Chennai', lat: 13.08, lon: 80.27 },
  { name: 'Dhaka', lat: 23.81, lon: 90.41, zone: 'Asia/Dhaka' },
  { name: 'Bangkok', lat: 13.76, lon: 100.5, zone: 'Asia/Bangkok' },
  { name: 'Singapore', lat: 1.35, lon: 103.82, zone: 'Asia/Singapore' },
  { name: 'Hong Kong', lat: 22.32, lon: 114.17, zone: 'Asia/Hong_Kong' },
  { name: 'Shanghai', lat: 31.23, lon: 121.47, zone: 'Asia/Shanghai' },
  { name: 'Manila', lat: 14.6, lon: 120.98, zone: 'Asia/Manila' },
  { name: 'Seoul', lat: 37.57, lon: 126.98, zone: 'Asia/Seoul' },
  { name: 'Tokyo', lat: 35.68, lon: 139.69, zone: 'Asia/Tokyo' },
  { name: 'Perth', lat: -31.95, lon: 115.86, zone: 'Australia/Perth' },
  { name: 'Sydney', lat: -33.87, lon: 151.21, zone: 'Australia/Sydney' },
  { name: 'Melbourne', lat: -37.81, lon: 144.96, zone: 'Australia/Melbourne' },
  { name: 'Auckland', lat: -36.85, lon: 174.76, zone: 'Pacific/Auckland' },
];

/** A starting city from the device's time zone. If none matches, the nearest by the clock's offset. */
export function suggestPlace(zone: string | undefined, offsetMinutesEastOfUtc: number): Place {
  const exact = PLACES.find((place) => place.zone && place.zone === zone);
  if (exact) return exact;
  const lon = (offsetMinutesEastOfUtc / 60) * 15;
  return PLACES.filter((place) => place.lat > 20).reduce((best, place) => (Math.abs(place.lon - lon) < Math.abs(best.lon - lon) ? place : best));
}

const RAD = Math.PI / 180;

/**
 * Sunrise and sunset for a calendar day, as minutes after midnight UTC of that day (they can be
 * below 0 or above 1440 for places far from Greenwich). `always` is set where the sun doesn't
 * rise or doesn't set that day.
 */
export function sunMinutesUtc(year: number, month: number, day: number, lat: number, lon: number): { rise: number; set: number; always?: 'light' | 'dark' } {
  const dayOfYear = Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000) + 1;
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosHour = Math.cos(90.833 * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl);
  const noon = 720 - 4 * lon - eqTime;
  if (cosHour > 1) return { rise: noon, set: noon, always: 'dark' };
  if (cosHour < -1) return { rise: noon, set: noon, always: 'light' };
  const hour = Math.acos(cosHour) / RAD;
  return { rise: noon - 4 * hour, set: noon + 4 * hour };
}

export interface SunDay { riseMs: number; setMs: number; always?: 'light' | 'dark' }

/** Today's sunrise and sunset as real moments, for the calendar day the device is on. */
export function sunDay(now: Date, place: Pick<Place, 'lat' | 'lon'>): SunDay {
  const base = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const { rise, set, always } = sunMinutesUtc(now.getFullYear(), now.getMonth() + 1, now.getDate(), place.lat, place.lon);
  return { riseMs: base + rise * 60000, setMs: base + set * 60000, always };
}

/** Light between sunrise and sunset, dark otherwise. */
export function isDarkAt(nowMs: number, sun: SunDay): boolean {
  if (sun.always) return sun.always === 'dark';
  return nowMs < sun.riseMs || nowMs >= sun.setMs;
}

/** The next moment the look should change, so a timer can be set for exactly then. */
export function nextChangeMs(nowMs: number, sun: SunDay): number {
  if (!sun.always && nowMs < sun.riseMs) return sun.riseMs;
  if (!sun.always && nowMs < sun.setMs) return sun.setMs;
  // After sunset (or no sunrise today): look again shortly after local midnight has surely passed.
  return nowMs + 6 * 3600_000;
}

export type ThemeChoice = 'light' | 'dark' | 'system' | 'sun';
export type Look = 'light' | 'dark';

/**
 * What to show. A choice of Light or Dark is simply that. For the automatic choices, pressing the
 * sun/moon button sets an override that stays until the student picks an option in Settings again.
 */
export function resolveLook(choice: ThemeChoice, override: Look | null, deviceDark: boolean, sunDark: boolean): Look {
  if (choice === 'light' || choice === 'dark') return choice;
  if (override) return override;
  return (choice === 'system' ? deviceDark : sunDark) ? 'dark' : 'light';
}
