import { useEffect, useState } from 'react';

type Render = (source: string) => string;
let loading: Promise<Render> | null = null;

/** KaTeX loads only when a note has an equation in it, so other pages stay light. */
function loadMath(): Promise<Render> {
  loading ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([module]) => {
    const katex = module.default;
    // trust: false means commands that could link out or add styles are refused, so an
    // equation can only ever draw maths.
    return (source: string) => katex.renderToString(source, { throwOnError: false, trust: false, strict: 'ignore', output: 'htmlAndMathml' });
  });
  return loading;
}

/** An equation from a note, drawn properly. Until it's ready, the plain text shows. */
export function MathText({ source }: { source: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadMath().then((render) => { if (live) setHtml(render(source)); }, () => undefined);
    return () => { live = false; };
  }, [source]);
  if (html === null) return <code className="note-math" data-testid="note-math">{source}</code>;
  // KaTeX escapes everything it's given and, with trust off, produces only maths markup.
  return <span className="note-math" data-testid="note-math" dangerouslySetInnerHTML={{ __html: html }} />;
}
