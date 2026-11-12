import { detectBrowser, type BrowserName } from './browserRules';

/** The browser this page is running in, worked out once. */
let found: BrowserName | null = null;
export function currentBrowser(): BrowserName {
  if (found) return found;
  const arcPalette = (() => {
    try { return getComputedStyle(document.documentElement).getPropertyValue('--arc-palette-title').trim() !== ''; } catch { return false; }
  })();
  found = detectBrowser({
    userAgent: navigator.userAgent,
    arcPalette,
    isBrave: typeof (navigator as Navigator & { brave?: unknown }).brave === 'object',
    touchMac: navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1,
  });
  return found;
}
