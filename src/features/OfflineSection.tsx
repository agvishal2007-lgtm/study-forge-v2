import { useSyncExternalStore } from 'react';
import { getOfflineState, installApp, subscribeOffline } from '../data/offline';

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function OfflineSection() {
  const { supported, ready, canInstall, installed } = useSyncExternalStore(subscribeOffline, getOfflineState);
  return (
    <section aria-labelledby="offline-heading" data-tour="offline">
      <h2 id="offline-heading">Offline and installing</h2>
      <p data-testid="offline-status">
        {!supported && "This browser can't save Study Forge for offline use, so it needs the internet to open."}
        {supported && !ready && 'Saving Study Forge to this device for offline use…'}
        {supported && ready && 'Study Forge is saved on this device, so it opens without internet.'}
      </p>
      <p className="muted">Offline, you can use your courses, files, notes, planner, flashcards, practice, lessons, and recording. Signing in, saving online, and adding files from Google Drive need the internet.</p>
      {installed && <p>You're using the installed app.</p>}
      {!installed && canInstall && <button className="button" onClick={() => void installApp()}>Install Study Forge</button>}
      {!installed && !canInstall && (
        <p className="muted" data-testid="install-help">
          {IS_IOS
            ? 'To install on an iPhone or iPad, open this site in Safari, tap Share, then Add to Home Screen.'
            : "To install, look for Install or Add to Home Screen in your browser's menu. Not every browser offers it."}
        </p>
      )}
    </section>
  );
}
