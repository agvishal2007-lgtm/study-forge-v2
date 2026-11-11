import { useEffect, useRef, useState } from 'react';
import { DriveError, fetchFromDrive, prepareDrive } from '../data/driveFiles';
import { formatBytes } from '../data/format';
import type { Material } from '../data/types';

/** In the viewer, when a file was added on another device: bring it here from the student's Drive. */
export function FromDrive({ material, email }: { material: Material; email?: string }) {
  const [received, setReceived] = useState<number | null>(null);
  const [failure, setFailure] = useState('');
  const stopper = useRef<AbortController | null>(null);
  useEffect(() => {
    void prepareDrive().catch(() => undefined);
    return () => stopper.current?.abort();
  }, []);

  if (!material.driveFileId) {
    return (
      <p className="notice" role="status" data-testid="file-elsewhere">
        This file was added on another device and isn't in your Google Drive yet. On the device where you added it, turn on <strong>Sync files with my Google Drive</strong> in Settings, and it will be ready here.
      </p>
    );
  }

  const get = async () => {
    setFailure('');
    setReceived(0);
    stopper.current = new AbortController();
    try {
      await fetchFromDrive(material, setReceived, stopper.current.signal, email);
      // The viewer picks the file up by itself once it's saved.
    } catch (error) {
      setReceived(null);
      if ((error as DriveError).kind !== 'cancelled' && (error as Error).name !== 'AbortError') setFailure((error as Error).message);
    }
  };

  return (
    <div className="notice" data-testid="file-in-drive">
      <p>This file was added on another device. It's in your Google Drive, ready to bring here.</p>
      {received === null ? (
        <button className="button" onClick={() => void get()}>Get it from Google Drive ({formatBytes(material.size)})</button>
      ) : (
        <>
          <p className="muted" role="status">Getting {material.name}: {formatBytes(received)} of {formatBytes(material.size)}. It's checked before it's saved.</p>
          <progress max={material.size || 1} value={received} aria-label={`Getting ${material.name}`} />
        </>
      )}
      {failure && <p className="error" role="alert">{failure}</p>}
    </div>
  );
}
