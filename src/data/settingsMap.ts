/*
 * What Settings is made of. Keeping the list of categories here, apart from the page, means the
 * page can't drift from the menu and a category can't exist with nothing real inside it.
 *
 * A category is only listed once it holds settings that genuinely do something. An empty heading
 * that promises a feature Study Forge doesn't have yet is worse than no heading at all.
 */
export interface SettingsCategory {
  slug: string;
  title: string;
  /** One line saying what a student would come here to change. */
  blurb: string;
  /**
   * True when the category holds several settings groups, so it needs a title of its own on the
   * everything-at-once page. A category with one group is already named by that group's heading,
   * and a second identical heading above it just reads as a stutter.
   */
  grouped?: true;
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { slug: 'school', title: 'School', blurb: 'Your school, and how your year is split into terms.' },
  { slug: 'appearance', title: 'Appearance', blurb: 'Light or dark, text size, spacing, and how dates and times read.' },
  { slug: 'tasks', title: 'Tasks and checklists', blurb: 'What a ticked-off task looks like, and how your list is grouped.' },
  { slug: 'sounds', title: 'Focus sounds', blurb: 'Steady background sound to study to, made by your browser and free of words.' },
  { slug: 'notifications', title: 'Notifications', blurb: 'What this device is allowed to show you.' },
  { slug: 'account', title: 'Account, sync and storage', blurb: 'Signing in, syncing, backups, offline use, Trash and space used.', grouped: true },
];

export const categoryBySlug = (slug: string | undefined): SettingsCategory | null =>
  SETTINGS_CATEGORIES.find((category) => category.slug === slug) ?? null;
