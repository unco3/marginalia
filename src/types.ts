export interface NoteEmbedding {
  path: string;
  mtime: number;
  hash: string;
  vector: number[];
  excerpt: string;
}

export type SuggestionReason = "contradiction" | "isomorphism" | "pattern" | "unknown";
export type Lens = "contradiction" | "isomorphism" | "pattern";

// Order matters: contradiction is usually fastest (direct opposition is easy to find).
// pattern is medium (meta-observation over candidates). isomorphism is slowest
// (cross-domain abstraction). Show fast lenses first so the user has something
// to engage with before the slow lens completes.
export const LENSES: readonly Lens[] = ["contradiction", "pattern", "isomorphism"];

export interface Suggestion {
  question: string;
  sourcePath: string;
  reason: SuggestionReason;
  evidence: string;
}

export interface IndexState {
  ready: boolean;
  total: number;
  embedded: number;
  errors: number;
}
