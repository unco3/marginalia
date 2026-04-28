import { Notice, TAbstractFile, TFile, Vault } from "obsidian";
import type { OllamaClient } from "./ollama-client";
import type { IndexState, NoteEmbedding } from "./types";

const EMBED_MAX_CHARS = 6000; // bge-m3 ctx 8K に対する余裕を持った打ち切り
const EXCERPT_CHARS = 1500;

function shortHash(s: string): string {
  // FNV-1a 32-bit。十分な衝突耐性 for cache invalidation
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export interface IndexerDeps {
  vault: Vault;
  client: OllamaClient;
  embeddingModel: string;
  excludedFolders: string[];
  keepAliveSec: number;
  loadCache: () => Promise<Record<string, NoteEmbedding> | null>;
  saveCache: (cache: Record<string, NoteEmbedding>) => Promise<void>;
  loadFailedPaths: () => Promise<Record<string, string> | null>;
  saveFailedPaths: (failed: Record<string, string>) => Promise<void>;
  onProgress: (s: IndexState) => void;
}

/** bge-m3 が NaN を返すなど、再試行しても直らない種類のエラーを判定 */
function isPermanentEmbedError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message;
  // bge-m3 の代表的な出力 NaN 問題
  if (msg.includes("NaN")) return true;
  // Ollama が 4xx/5xx を model 由来の理由で返した場合（ネットワークではない）
  if (/Ollama embed failed: (4\d\d|500)/.test(msg)) return true;
  return false;
}

export class Indexer {
  private cache: Record<string, NoteEmbedding> = {};
  private failedPaths: Record<string, string> = {};
  private state: IndexState = { ready: false, total: 0, embedded: 0, errors: 0 };
  private writePending = false;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private failedPathsDirty = false;

  constructor(private deps: IndexerDeps) {}

  getState(): IndexState {
    return { ...this.state };
  }

  isExcluded(path: string): boolean {
    return this.deps.excludedFolders.some(
      (f) => path === f || path.startsWith(f + "/"),
    );
  }

  async init(): Promise<void> {
    const loaded = await this.deps.loadCache();
    if (loaded) this.cache = loaded;
    const failed = await this.deps.loadFailedPaths();
    if (failed) this.failedPaths = failed;
    await this.fullScan();
  }

  async fullScan(): Promise<void> {
    const files = this.deps.vault.getMarkdownFiles().filter((f) => !this.isExcluded(f.path));
    this.state = { ready: false, total: files.length, embedded: 0, errors: 0 };
    this.deps.onProgress(this.state);

    // 既存キャッシュを基準に、未登録 / mtime 更新分だけ再計算
    let progress = 0;
    for (const file of files) {
      // 永続的に embed 不能と判明しているファイルは早期スキップ（NaN問題等）
      if (this.failedPaths[file.path]) {
        this.state.errors++;
        progress++;
        if (progress % 25 === 0) this.deps.onProgress(this.state);
        continue;
      }
      const cached = this.cache[file.path];
      if (cached && cached.mtime === file.stat.mtime) {
        // mtime 同じ → embedding は再計算不要。
        // ただし EXCERPT_CHARS が拡張されている場合は excerpt のみ更新する（embed はしない）
        if (cached.excerpt.length < EXCERPT_CHARS) {
          try {
            const content = await this.deps.vault.cachedRead(file);
            if (content.length > cached.excerpt.length) {
              cached.excerpt = content.slice(0, EXCERPT_CHARS);
            }
          } catch {
            // 読めなければ古い excerpt のまま継続
          }
        }
        this.state.embedded++;
        progress++;
        if (progress % 25 === 0) this.deps.onProgress(this.state);
        continue;
      }
      try {
        await this.embedFile(file);
        this.state.embedded++;
      } catch (e) {
        console.warn("[Marginalia] embed failed", file.path, e);
        this.state.errors++;
        if (isPermanentEmbedError(e)) {
          const reason = e instanceof Error ? e.message : String(e);
          this.failedPaths[file.path] = reason.slice(0, 200);
          this.failedPathsDirty = true;
        }
      }
      progress++;
      if (progress % 5 === 0) this.deps.onProgress(this.state);
    }

    // 削除されたパスを cache から落とす
    const present = new Set(files.map((f) => f.path));
    for (const p of Object.keys(this.cache)) {
      if (!present.has(p)) delete this.cache[p];
    }

    this.state.ready = true;
    this.deps.onProgress(this.state);
    this.scheduleSave();
    if (this.failedPathsDirty) {
      this.failedPathsDirty = false;
      void this.deps.saveFailedPaths({ ...this.failedPaths });
    }
    const failedCount = Object.keys(this.failedPaths).length;
    const failedSuffix = failedCount > 0 ? `, skipped ${failedCount} permanently` : "";
    new Notice(
      `Marginalia: index ready (${this.state.embedded}/${this.state.total}${failedSuffix})`,
    );
  }

  private async embedFile(file: TFile): Promise<void> {
    const content = await this.deps.vault.cachedRead(file);
    const trimmed = content.length > EMBED_MAX_CHARS ? content.slice(0, EMBED_MAX_CHARS) : content;
    if (trimmed.trim().length === 0) {
      // 空ノートはスキップ。エラーとはみなさない。
      return;
    }
    const hash = shortHash(trimmed);
    const cached = this.cache[file.path];
    if (cached && cached.hash === hash) {
      // mtime は変わったが内容は同じケース
      cached.mtime = file.stat.mtime;
      return;
    }
    const vector = await this.deps.client.embed(
      trimmed,
      this.deps.embeddingModel,
      this.deps.keepAliveSec,
    );
    this.cache[file.path] = {
      path: file.path,
      mtime: file.stat.mtime,
      hash,
      vector,
      excerpt: trimmed.slice(0, EXCERPT_CHARS),
    };
  }

  async onFileChange(file: TAbstractFile): Promise<void> {
    if (!(file instanceof TFile) || file.extension !== "md") return;
    if (this.isExcluded(file.path)) return;
    try {
      await this.embedFile(file);
      this.scheduleSave();
    } catch (e) {
      console.warn("[Marginalia] re-embed failed", file.path, e);
    }
  }

  onFileDelete(file: TAbstractFile): void {
    if (!(file instanceof TFile)) return;
    if (this.cache[file.path]) {
      delete this.cache[file.path];
      this.scheduleSave();
    }
  }

  onFileRename(file: TAbstractFile, oldPath: string): void {
    if (!(file instanceof TFile)) return;
    const prev = this.cache[oldPath];
    if (prev) {
      delete this.cache[oldPath];
      prev.path = file.path;
      this.cache[file.path] = prev;
      this.scheduleSave();
    }
  }

  async query(text: string, k: number): Promise<NoteEmbedding[]> {
    if (!text.trim()) return [];
    const qvec = await this.deps.client.embed(
      text,
      this.deps.embeddingModel,
      this.deps.keepAliveSec,
    );
    const scored: { score: number; e: NoteEmbedding }[] = [];
    for (const e of Object.values(this.cache)) {
      scored.push({ score: cosine(qvec, e.vector), e });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k).map((s) => s.e);
  }

  setExcluded(folders: string[]): void {
    this.deps.excludedFolders = folders;
  }

  setEmbeddingModel(model: string): void {
    // モデルを変えると次元が変わる可能性 → 既存キャッシュは破棄
    if (this.deps.embeddingModel !== model) {
      this.cache = {};
      this.scheduleSave();
    }
    this.deps.embeddingModel = model;
  }

  private scheduleSave(): void {
    this.writePending = true;
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(async () => {
      this.writeTimer = null;
      if (!this.writePending) return;
      this.writePending = false;
      await this.deps.saveCache(this.cache);
    }, 5_000);
  }

  async flush(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    if (this.writePending) {
      this.writePending = false;
      await this.deps.saveCache(this.cache);
    }
  }
}
