import { useSyncExternalStore } from 'react';
import { getOfflineState, subscribeOffline, useNewVersion } from '../data/offline';

/** Says when there's no internet, and offers a new version without interrupting anything. */
export function OfflineNotices() {
  const { online, updateWaiting } = useSyncExternalStore(subscribeOffline, getOfflineState);
  return (
    <>
      {!online && (
        <p className="site-notice" role="status" data-testid="offline-notice">
          You're offline. Your work on this device still saves, and online saving catches up when you reconnect.
        </p>
      )}
      {updateWaiting && (
        <p className="site-notice" role="status" data-testid="update-notice">
          A new version of Study Forge is ready. Finish any recording first.{' '}
          <button className="text-button" onClick={useNewVersion}>Refresh now</button>
        </p>
      )}
    </>
  );
}
