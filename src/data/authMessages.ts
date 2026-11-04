/** Plain words for sign-in problems. Returns nothing when the student simply closed the window. */
export function describeAuthFailure(error: unknown, provider?: string): string {
  const code = String((error as { code?: string }).code ?? '');
  // No email or password was typed, so the failure can't be about them.
  if (provider && (code.includes('invalid-credential') || code.includes('invalid-login'))) {
    return `${provider} sign-in didn't finish. Please press the button and try again. If it keeps happening, tell whoever runs this site that the code was ${code}.`;
  }
  if (code.includes('popup-closed') || code.includes('cancelled-popup')) return '';
  if (code.includes('popup-blocked')) return 'Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.';
  if (code.includes('network')) return "Study Forge can't reach the internet, so you can't sign in right now.";
  if (code.includes('unauthorized-domain')) return "This site isn't set up to allow sign-in yet. Tell whoever runs it.";
  if (code.includes('operation-not-allowed')) return "This way of signing in isn't turned on yet. Tell whoever runs this site, or use another way.";
  if (code.includes('web-storage') || code.includes('storage')) return 'Your browser is blocking the site data that sign-in needs. Allow site data for this site, or use another browser.';
  if (code.includes('admin') || code.includes('access-denied')) return 'Your school blocked this sign-in. You can still use Study Forge without an account, or try a personal account.';
  if (code.includes('account-exists-with-different-credential')) return 'You already have an account with this email, using a different way of signing in. Use that way instead.';
  if (code.includes('email-already-in-use')) return 'An account with this email already exists. Sign in instead, or reset your password if you forgot it.';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found') || code.includes('invalid-login')) return "That email and password don't match. Check them and try again, or reset your password.";
  if (code.includes('invalid-email')) return "That doesn't look like an email address. Check it and try again.";
  if (code.includes('weak-password')) return 'Choose a longer password, with at least 8 characters.';
  if (code.includes('too-many-requests')) return 'Too many tries in a row, so this is paused for now. Wait a few minutes and try again.';
  if (code.includes('user-disabled')) return 'This account has been turned off. Tell whoever runs this site.';
  return `That didn't work. ${(error as Error).message}`;
}

export const looksLikeEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
export const MIN_PASSWORD = 8;

export function signUpProblems(email: string, password: string, confirm: string): string[] {
  const problems: string[] = [];
  if (!looksLikeEmail(email)) problems.push('Enter your email address.');
  if (password.length < MIN_PASSWORD) problems.push(`Choose a password with at least ${MIN_PASSWORD} characters.`);
  else if (password !== confirm) problems.push("The two passwords don't match.");
  return problems;
}
