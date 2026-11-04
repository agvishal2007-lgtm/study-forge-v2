/**
 * Notes stay plain text with a few simple marks, such as **bold** and "- " for a list. That keeps
 * them readable anywhere, keeps saving online simple, and leaves every existing note as it is.
 * Nothing here produces HTML, so a note can never run code on the site. This file only calculates.
 */
export type Inline = { text: string; bold?: boolean; italic?: boolean };
export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; inline: Inline[] }
  | { type: 'bullets'; items: Inline[][] }
  | { type: 'numbers'; items: Inline[][] }
  | { type: 'checks'; items: { done: boolean; inline: Inline[] }[] }
  | { type: 'paragraph'; lines: Inline[][] };

export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  const pattern = /\*\*(?=\S)(.+?)(?<=\S)\*\*|\*(?=[^\s*])([^*]+?)(?<=\S)\*/g;
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > at) parts.push({ text: text.slice(at, match.index) });
    if (match[1] !== undefined) parts.push({ text: match[1], bold: true });
    else parts.push({ text: match[2], italic: true });
    at = match.index + match[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

export function parseNote(text: string): Block[] {
  const blocks: Block[] = [];
  const last = () => blocks[blocks.length - 1];
  for (const line of text.split('\n')) {
    const heading = line.match(/^(#{1,3}) +(.+)$/);
    const check = line.match(/^\s*- \[( |x|X)\] +(.*)$/);
    const bullet = line.match(/^\s*[-•] +(.*)$/);
    const number = line.match(/^\s*\d+\. +(.*)$/);
    if (heading) blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, inline: parseInline(heading[2]) });
    else if (check) {
      const item = { done: check[1] !== ' ', inline: parseInline(check[2]) };
      const previous = last();
      if (previous?.type === 'checks') previous.items.push(item);
      else blocks.push({ type: 'checks', items: [item] });
    } else if (bullet) {
      const previous = last();
      if (previous?.type === 'bullets') previous.items.push(parseInline(bullet[1]));
      else blocks.push({ type: 'bullets', items: [parseInline(bullet[1])] });
    } else if (number) {
      const previous = last();
      if (previous?.type === 'numbers') previous.items.push(parseInline(number[1]));
      else blocks.push({ type: 'numbers', items: [parseInline(number[1])] });
    } else if (!line.trim()) {
      blocks.push({ type: 'paragraph', lines: [] });
    } else {
      const previous = last();
      if (previous?.type === 'paragraph' && previous.lines.length > 0) previous.lines.push(parseInline(line));
      else blocks.push({ type: 'paragraph', lines: [parseInline(line)] });
    }
  }
  return blocks.filter((block) => block.type !== 'paragraph' || block.lines.length > 0);
}

/** A note's words without its marks, for showing in search results. */
export const plainNote = (text: string) => text.split('\n')
  .map((line) => parseInline(line.replace(/^(#{1,3} +|\s*- \[[ xX]\] +|\s*[-•] +|\s*\d+\. +)/, '')).map((part) => part.text).join(''))
  .join('\n');

export type FormatKind = 'bold' | 'italic' | 'heading' | 'bullet' | 'number' | 'check';

export interface FormatEdit {
  from: number;
  to: number;
  insert: string;
  selectionStart: number;
  selectionEnd: number;
}

const LINE_MARK: Record<'heading' | 'bullet' | 'number' | 'check', RegExp> = {
  heading: /^## /,
  bullet: /^- (?!\[)/,
  number: /^\d+\. /,
  check: /^- \[[ xX]\] /,
};

/** Says what to change for a toolbar press. Pressing it again on marked text takes the mark off. */
export function formatEdit(text: string, start: number, end: number, kind: FormatKind): FormatEdit {
  if (kind === 'bold' || kind === 'italic') {
    const mark = kind === 'bold' ? '**' : '*';
    const chosen = text.slice(start, end);
    const size = mark.length;
    const wrapped = text.slice(start - size, start) === mark && text.slice(end, end + size) === mark
      && (kind === 'bold' || text[start - size - 1] !== '*');
    if (wrapped) return { from: start - size, to: end + size, insert: chosen, selectionStart: start - size, selectionEnd: end - size };
    return { from: start, to: end, insert: `${mark}${chosen}${mark}`, selectionStart: start + size, selectionEnd: end + size };
  }
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const after = text.indexOf('\n', Math.max(start, end - (end > start && text[end - 1] === '\n' ? 1 : 0)));
  const to = after === -1 ? text.length : after;
  const lines = text.slice(from, to).split('\n');
  const removing = lines.every((line) => !line.trim() || LINE_MARK[kind].test(line));
  let counter = 0;
  const insert = lines.map((line) => {
    const bare = line.replace(/^(## |- \[[ xX]\] |- |\d+\. )/, '');
    if (removing) return bare;
    if (!line.trim() && lines.length > 1) return line;
    counter += 1;
    const mark = kind === 'heading' ? '## ' : kind === 'bullet' ? '- ' : kind === 'check' ? '- [ ] ' : `${counter}. `;
    return `${mark}${bare}`;
  }).join('\n');
  return { from, to, insert, selectionStart: from + insert.length, selectionEnd: from + insert.length };
}

export const applyEdit = (text: string, edit: FormatEdit) => `${text.slice(0, edit.from)}${edit.insert}${text.slice(edit.to)}`;
