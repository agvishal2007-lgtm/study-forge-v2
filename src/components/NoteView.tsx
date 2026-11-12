import { parseNote, type Inline } from '../data/noteFormat';
import { MathText } from './MathText';

const Text = ({ parts }: { parts: Inline[] }) => (
  <>
    {parts.map((part, index) => {
      if (part.math) return <MathText key={index} source={part.text} />;
      if (part.bold) return <strong key={index}>{part.text}</strong>;
      if (part.italic) return <em key={index}>{part.text}</em>;
      return <span key={index}>{part.text}</span>;
    })}
  </>
);

/** Shows a note's formatting. It's built from plain React text, so a note can't run code. Equations
 *  are drawn by KaTeX, which only ever makes maths. */
export function NoteView({ body }: { body: string }) {
  const blocks = parseNote(body);
  if (blocks.length === 0) return <p className="muted">Nothing written yet.</p>;
  return (
    <div className="note-view" data-testid="note-view" tabIndex={0}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Heading = block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4';
          return <Heading key={index}><Text parts={block.inline} /></Heading>;
        }
        if (block.type === 'bullets') return <ul key={index}>{block.items.map((item, line) => <li key={line}><Text parts={item} /></li>)}</ul>;
        if (block.type === 'numbers') return <ol key={index}>{block.items.map((item, line) => <li key={line}><Text parts={item} /></li>)}</ol>;
        if (block.type === 'checks') {
          return (
            <ul key={index} className="note-checks">
              {block.items.map((item, line) => (
                <li key={line} data-done={item.done}>
                  <span aria-hidden="true">{item.done ? '☑' : '☐'}</span> <span className="sr-only">{item.done ? 'Done: ' : 'To do: '}</span><Text parts={item.inline} />
                </li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{block.lines.map((line, row) => <span key={row}>{row > 0 && <br />}<Text parts={line} /></span>)}</p>;
      })}
    </div>
  );
}
