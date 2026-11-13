import { Link } from 'react-router-dom';
import { useState } from 'react';
import { AccountSection } from './AccountSection';
import { AppearanceSection } from './AppearanceSection';
import { BackupSection } from './BackupSection';
import { OfflineSection } from './OfflineSection';
import { formatBytes } from '../data/format';
import { getActiveAccount } from '../data/account';
import { getStorageStatus, requestKeepFiles } from '../data/store';
import { useLive } from '../data/useLive';
import { SCHOOL_LEVELS, saveSchoolProfile, useSchoolProfile } from '../data/schoolProfile';
import { PermissionsSection } from './PermissionsSection';

export function SettingsPage() {
  const [asked, setAsked] = useState(false);
  const school = useSchoolProfile();
  const { data } = useLive(getStorageStatus, [asked]);
  return (
    <div className="page settings-page">
      <h1>Settings</h1>
      <section aria-labelledby="school-level-heading">
        <h2 id="school-level-heading">School level</h2>
        <label>Choose your school level
          <select value={school.level} onChange={event => saveSchoolProfile({ ...school, level: event.target.value as typeof school.level })}>
            {SCHOOL_LEVELS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <p className="muted small">This changes course suggestions and wording, not existing classes, marks or deadlines. Reopen setup from Courses.</p>
      </section>
      <AccountSection />
      <AppearanceSection />
      <BackupSection />
      <OfflineSection />
      <PermissionsSection />

      <section aria-labelledby="trash-heading">
        <h2 id="trash-heading">Trash</h2>
        <p className="muted">Restore or permanently delete anything you deleted, from any part of Study Forge.</p>
        <Link className="button" to="/trash">Open Trash</Link>
      </section>

      <section aria-labelledby="storage-heading">
        <h2 id="storage-heading">Storage on this device</h2>
        <p>{getActiveAccount()
          ? 'Everything is kept in this browser on this device, and syncs to your account. Files and recordings sync too once you turn on Google Drive syncing above.'
          : school.age === 'under13' ? 'Everything is kept only in this browser on this device. Account and cloud syncing are unavailable in local-only mode.' : 'Everything is kept only in this browser on this device. Sign in to sync it to your other devices.'}</p>
        <p>Clearing this browser's site data or losing this device removes anything that isn't synced, so create a backup regularly.</p>
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
      <p className="muted settings-legal"><Link to="/help">Study Forge Academy</Link> · <Link to="/terms">Terms of Use</Link> · <Link to="/privacy">Privacy Policy</Link></p>
    </div>
  );
}
