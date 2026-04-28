export interface NoteEmbedding {
  path: string;
  mtime: number;
  hash: string;
  vector: number[];
  excerpt: string;
}

export type SuggestionReason = "contradiction" | "isomorphism" | "pattern" | "unknown";
export type Lens = "contradiction" | "isomorphism" | "pattern";

export const LENSES: readonly Lens[] = ["contradiction", "isomorphism", "pattern"];

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
