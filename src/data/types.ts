export interface Course {
  id: string;
  name: string;
  code: string;
  color: string;
  createdAt: number;
}

export interface Topic {
  id: string;
  courseId: string;
  name: string;
  createdAt: number;
}

/** A saved file. A record exists only after the original was stored completely. */
export interface Material {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  hash: string;
  courseId: string | null;
  topicId: string | null;
  createdAt: number;
}

export type MaterialKind = 'pdf' | 'image' | 'audio' | 'video' | 'text' | 'other';

export const SPINE_COLORS = ['#E8B94F', '#4FB7A8', '#8EA2F0', '#E58FA9', '#9CCB6B', '#62B5E5'];
