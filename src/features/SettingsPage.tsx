import { useEffect } from 'react';
import { Link, NavLink, useParams, useSearchParams } from 'react-router-dom';
import { StudyToolsSection } from './StudyToolsSection';
import { TrashKeepSection } from './TrashKeepSection';
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

      <TrashKeepSection />

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
  tools: () => <StudyToolsSection />,
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
  /*
   * A link that names a section goes to that section, not to the top of a long page.
   *
   * Settings is long enough on a phone that landing at the top and scrolling for the thing you
   * tapped is its own small chore — the owner hit exactly this coming from Trash. The section is
   * also focused, so a keyboard or a screen reader lands there too rather than being told nothing
   * moved. Scrolled without animation on purpose: arriving somewhere should be instant, and a
   * student who has asked for a particular setting does not need to watch the journey.
   */
  const [params] = useSearchParams();
  const go = params.get('go');
  useEffect(() => {
    if (!go) return;
    const target = document.getElementById(go);
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: 'auto' });
    (target as HTMLElement).focus({ preventScroll: true });
  }, [go, chosen]);

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
      {/*
        * Help lives in one place: the ? button in the top bar, at every screen size. It was briefly
        * here as well, when that button had been moved out to make room, and the owner asked for
        * both copies to go once it came back. Two routes to the same two choices is how a student
        * ends up unsure which is the real one.
        */}
      <p className="muted settings-legal">
        <Link to="/terms">Terms of Use</Link> · <Link to="/privacy">Privacy Policy</Link></p>
    </div>
  );
}
