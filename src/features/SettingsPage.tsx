import { Link, NavLink, useParams } from 'react-router-dom';
import { useState, type ReactElement } from 'react';
import { AccountSection } from './AccountSection';
import { AppearanceSection } from './AppearanceSection';
import { BackupSection } from './BackupSection';
import { OfflineSection } from './OfflineSection';
import { formatBytes } from '../data/format';
import { getActiveAccount } from '../data/account';
import { getStorageStatus, requestKeepFiles } from '../data/store';
import { useLive } from '../data/useLive';
import { PermissionsSection } from './PermissionsSection';
import { RemindersSection } from './RemindersSection';
import { SchoolSection } from './SchoolSection';
import { TasksSection } from './TasksSection';
import { SETTINGS_CATEGORIES, categoryBySlug } from '../data/settingsMap';
import { FocusSoundsSection } from './FocusSoundsSection';

function StorageSection() {
  const [asked, setAsked] = useState(false);
  const { data } = useLive(getStorageStatus, [asked]);
  return (
    <>
      <section aria-labelledby="trash-heading">
        <h2 id="trash-heading">Trash</h2>
        <p className="muted">Restore or permanently delete anything you deleted, from any part of Study Forge.</p>
        <Link className="button" to="/trash">Open Trash</Link>
      </section>

      <section aria-labelledby="storage-heading">
        <h2 id="storage-heading">Storage on this device</h2>
        <p>{getActiveAccount()
          ? 'Everything is kept in this browser on this device, and syncs to your account. Files and recordings sync too once you turn on Google Drive syncing above.'
          : 'Everything is kept only in this browser on this device. Sign in to sync it to your other devices.'}</p>
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
    </>
  );
}

/** The settings themselves, by category. One place decides what belongs where. */
const SECTIONS: Record<string, () => ReactElement> = {
  school: () => <SchoolSection />,
  appearance: () => <AppearanceSection />,
  tasks: () => <TasksSection />,
  sounds: () => <FocusSoundsSection />,
  notifications: () => <><RemindersSection /><PermissionsSection /></>,
  account: () => <><AccountSection /><BackupSection /><OfflineSection /><StorageSection /></>,
};

/**
 * Settings, grouped so a student can find one thing without reading all of it. Opening a category
 * shows just that category; plain /settings still shows everything on one page, so a link or a
 * search that lands there, and anyone who'd rather scroll, finds what they came for.
 */
export function SettingsPage() {
  const { category: slug } = useParams();
  const chosen = categoryBySlug(slug);
  const showing = chosen ? [chosen] : SETTINGS_CATEGORIES;
  return (
    <div className="page settings-page">
      <h1>Settings</h1>
      <nav className="settings-nav" aria-label="Settings categories">
        <NavLink to="/settings" end className={chosen ? undefined : 'active'}>Everything</NavLink>
        {SETTINGS_CATEGORIES.map((item) => (
          <NavLink key={item.slug} to={`/settings/${item.slug}`}>{item.title}</NavLink>
        ))}
      </nav>
      {chosen && <p className="muted">{chosen.blurb}</p>}
      {showing.map((item) => (
        <div key={item.slug} className="settings-category" data-category={item.slug}>
          {!chosen && item.grouped && <h2 className="settings-category-title">{item.title}</h2>}
          {SECTIONS[item.slug]()}
        </div>
      ))}
      <p className="muted settings-legal"><Link to="/help">Study Forge Academy</Link> · <Link to="/terms">Terms of Use</Link> · <Link to="/privacy">Privacy Policy</Link></p>
    </div>
  );
}
