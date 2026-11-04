import { useState } from 'react';
import { AccountSection } from './AccountSection';
import { AppearanceSection } from './AppearanceSection';
import { BackupSection } from './BackupSection';
import { OfflineSection } from './OfflineSection';
import { formatBytes } from '../data/format';
import { getActiveAccount } from '../data/account';
import { getStorageStatus, requestKeepFiles } from '../data/store';
import { useLive } from '../data/useLive';

export function SettingsPage() {
  const [asked, setAsked] = useState(false);
  const { data } = useLive(getStorageStatus, [asked]);
  return (
    <div className="page">
      <h1>Settings</h1>
      <AccountSection />
      <AppearanceSection />
      <BackupSection />
      <OfflineSection />
      <section aria-labelledby="storage-heading">
        <h2 id="storage-heading">Storage on this device</h2>
        <p>{getActiveAccount()
          ? 'Your files and recordings are saved only in this browser on this device. They don\'t sync to your other devices.'
          : 'Your courses and files are saved only in this browser on this device. They don\'t sync to your other devices.'}</p>
        <p>Clearing this browser's site data or losing this device removes them, so create a backup regularly.</p>
        {data?.usage != null && data.quota != null && (
          <p>Using {formatBytes(data.usage)} of about {formatBytes(data.quota)} that this browser allows.</p>
        )}
        {data?.persisted === true && <p>This browser has agreed to keep your files when the device runs low on space.</p>}
        {data?.persisted === false && (
          <>
            <p>This browser may clear your files if the device runs low on space.</p>
            <button className="button" onClick={async () => { await requestKeepFiles(); setAsked(true); }}>Ask to keep my files</button>
            {asked && <p className="muted">The browser didn't agree yet. It may need you to use the site more or install it.</p>}
          </>
        )}
      </section>
    </div>
  );
}
