import { getDb, notifyChanged } from './db';
import type { Transcript } from './types';

export const listTranscripts = async (): Promise<Transcript[]> => (await getDb()).getAll('transcripts');
export const getTranscript = async (materialId: string) => (await getDb()).get('transcripts', materialId);

export async function saveTranscript(materialId: string, text: string, model: string): Promise<void> {
  const db = await getDb();
  const current = await db.get('transcripts', materialId);
  const updatedAt = Math.max(Date.now(), (current?.updatedAt ?? 0) + 1);
  await db.put('transcripts', { materialId, text, model, createdAt: current?.createdAt ?? updatedAt, updatedAt });
  notifyChanged();
}

export async function deleteTranscript(materialId: string): Promise<void> {
  await (await getDb()).delete('transcripts', materialId);
  notifyChanged();
}
