/**
 * The readable words of an RTF document, without its formatting codes. Paragraph and line breaks
 * are kept; pictures, fonts and colour tables are dropped. Nothing in the file is ever run.
 */
export function rtfToText(rtf: string): string {
  if (!rtf.trimStart().startsWith('{\\rtf')) return rtf;
  let out = '';
  let depth = 0;
  const skipAt: number[] = [];
  const SKIP = /^(fonttbl|colortbl|stylesheet|info|pict|object|header|footer|themedata|colorschememapping|latentstyles|datastore|xmlnstbl|listtable|listoverridetable|rsidtbl|generator|\*)$/;
  for (let i = 0; i < rtf.length; i++) {
    const ch = rtf[i];
    const skipping = skipAt.length > 0;
    if (ch === '{') { depth += 1; continue; }
    if (ch === '}') { if (skipAt.at(-1) === depth) skipAt.pop(); depth -= 1; continue; }
    if (ch === '\\') {
      const next = rtf[i + 1];
      if (next === '\\' || next === '{' || next === '}') { if (!skipping) out += next; i += 1; continue; }
      if (next === "'") {
        if (!skipping) out += String.fromCharCode(parseInt(rtf.slice(i + 2, i + 4), 16));
        i += 3;
        continue;
      }
      const word = /^\\([a-zA-Z]+)(-?\d+)? ?|^\\(\*)/.exec(rtf.slice(i));
      if (!word) { i += 1; continue; }
      const name = word[1] ?? word[3];
      i += word[0].length - 1;
      if (SKIP.test(name) && skipAt.at(-1) !== depth) { skipAt.push(depth); continue; }
      if (skipping) continue;
      if (name === 'par' || name === 'line') out += '\n';
      else if (name === 'tab') out += '\t';
      else if (name === 'u' && word[2]) { out += String.fromCharCode(Number(word[2]) < 0 ? Number(word[2]) + 65536 : Number(word[2])); if (rtf[i + 1] === '?') i += 1; }
      continue;
    }
    if (ch === '\r' || ch === '\n') continue;
    if (!skipping) out += ch;
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
