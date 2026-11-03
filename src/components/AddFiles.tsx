import { useRef, useState } from 'react';
import { useSaveQueue } from './SaveQueue';

/** Choose or drag files. Saving keeps running while the student moves between screens. */
export function AddFiles({ courseId = null, topicId = null }: { courseId?: string | null; topicId?: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const { addFiles } = useSaveQueue();
  return (
    <div
      className={over ? 'drop over' : 'drop'}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        addFiles([...event.dataTransfer.files], { courseId, topicId });
      }}
    >
      <button className="button primary" onClick={() => input.current?.click()}>Add files</button>
      <span className="muted">or drag them here</span>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        data-testid="file-input"
        onChange={(event) => {
          addFiles([...(event.target.files ?? [])], { courseId, topicId });
          event.target.value = '';
        }}
      />
    </div>
  );
}
