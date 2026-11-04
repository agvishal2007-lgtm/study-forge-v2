/** Tracks whether this device has the site saved for offline use, whether it's online, and any waiting update. */
export interface OfflineState {
  supported: boolean;
  ready: boolean;
  online: boolean;
  updateWaiting: boolean;
  canInstall: boolean;
  installed: boolean;
}

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

const REGISTERS = import.meta.env.PROD && import.meta.env.VITE_ACCOUNT_BACKEND !== 'test' && 'serviceWorker' in navigator;
const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

let state: OfflineState = { supported: REGISTERS, ready: false, online: navigator.onLine, updateWaiting: false, canInstall: false, installed: isInstalled() };
const listeners = new Set<() => void>();
let waiting: ServiceWorker | null = null;
let installPrompt: InstallPrompt | null = null;
let chosenRefresh = false;

function set(patch: Partial<OfflineState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export const getOfflineState = () => state;
export function subscribeOffline(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function startOffline() {
  window.addEventListener('online', () => set({ online: true }));
  window.addEventListener('offline', () => set({ online: false }));
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as InstallPrompt;
    set({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    set({ canInstall: false, installed: true });
  });
  if (!REGISTERS) return;

  const offerUpdate = (worker: ServiceWorker) => {
    waiting = worker;
    set({ updateWaiting: true });
  };
  // Only the tab that chose to refresh reloads, so another tab's recording or draft isn't interrupted.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (chosenRefresh) window.location.reload();
  });
  void navigator.serviceWorker.ready.then(() => set({ ready: true }));
  navigator.serviceWorker.register('./sw.js').then((registration) => {
    if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
    // A site left open for days still hears about new versions.
    window.addEventListener('focus', () => { void registration.update().catch(() => undefined); });
  }).catch(() => set({ supported: false }));
}

export function useNewVersion() {
  if (!waiting) return;
  chosenRefresh = true;
  waiting.postMessage('use-new-version');
}

export async function installApp() {
  if (!installPrompt) return;
  await installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  if (outcome === 'accepted') {
    installPrompt = null;
    set({ canInstall: false });
  }
}
