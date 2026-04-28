import {
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  TAbstractFile,
  WorkspaceLeaf,
} from "obsidian";
import { DEFAULT_SETTINGS, MarginaliaSettingTab, PluginSettings } from "./settings";
import { OllamaClient } from "./ollama-client";
import { Indexer } from "./indexer";
import { MarginaliaView, VIEW_TYPE_MARGINALIA } from "./view";
import { Debouncer } from "./debounce";
import {
  buildMessages,
  evidenceMatchesExcerpt,
  parseSuggestion,
  resolveCandidatePath,
} from "./prompt";
import { LENSES, type Lens, type NoteEmbedding } from "./types";
import { SetupWizard } from "./wizard";

interface PersistedData {
  settings: PluginSettings;
  cache?: Record<string, NoteEmbedding>;
  failedPaths?: Record<string, string>;
}

/** 200字超の ```...``` コードブロックを除去する。
 * 長文に大きなコードブロックが含まれる場合、トレイル抽出が「コード」になってしまい
 * embedding/LLM が prose の文脈ではなくコード片として処理してしまう問題への対処。
 * 200字以下のインラインっぽいコードは残す（短い snippet は文脈として有効なことがある）。
 */
function stripLargeCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, (m) => (m.length > 200 ? "" : m));
}

export default class MarginaliaPlugin extends Plugin {
  settings!: PluginSettings;
  client!: OllamaClient;
  indexer!: Indexer;
  private debouncer!: Debouncer<[string, string | null]>;
  private view: MarginaliaView | null = null;
  private currentAbort: AbortController | null = null;
  private paused = false;
  private isFirstRun = false;
  private lastEditorState: { text: string; activePath: string | null } = {
    text: "",
    activePath: null,
  };

  async onload(): Promise<void> {
    await this.loadSettings();
    this.client = new OllamaClient(this.settings.ollamaEndpoint);

    this.indexer = new Indexer({
      vault: this.app.vault,
      client: this.client,
      embeddingModel: this.settings.embeddingModel,
      excludedFolders: this.settings.excludedFolders,
      keepAliveSec: this.settings.keepAliveSec,
      loadCache: async () => {
        const data = (await this.loadData()) as PersistedData | null;
        return data?.cache ?? null;
      },
      saveCache: async (cache) => {
        await this.savePersisted({ cache });
      },
      loadFailedPaths: async () => {
        const data = (await this.loadData()) as PersistedData | null;
        return data?.failedPaths ?? null;
      },
      saveFailedPaths: async (failed) => {
        await this.savePersisted({ failedPaths: failed });
      },
      onProgress: (s) => {
        this.view?.setIndexProgress(s);
      },
    });

    this.registerView(VIEW_TYPE_MARGINALIA, (leaf) => {
      this.view = new MarginaliaView(leaf, this);
      this.view.setIndexProgress(this.indexer.getState());
      return this.view;
    });

    this.addSettingTab(new MarginaliaSettingTab(this.app, this));

    this.addCommand({
      id: "open-marginalia-pane",
      name: "Open Marginalia pane",
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: "rebuild-index",
      name: "Rebuild index",
      callback: () => this.rebuildIndex(),
    });

    this.addCommand({
      id: "toggle-pause",
      name: "Toggle pause",
      callback: () => this.togglePause(),
    });

    this.addCommand({
      id: "regenerate-now",
      name: "Regenerate suggestions now",
      callback: () => void this.triggerNow(),
    });

    this.addCommand({
      id: "open-setup-wizard",
      name: "Open setup wizard",
      callback: () => new SetupWizard(this.app, this).open(),
    });

    this.debouncer = new Debouncer<[string, string | null]>(
      (text, activePath) => void this.suggestFor(text, activePath),
      this.settings.debounceMs,
    );

    this.registerEvent(
      this.app.workspace.on("editor-change", (editor: Editor, info) => {
        if (!(info instanceof MarkdownView)) return;
        // カーソル位置より前のテキストを context として使う。
        // 末尾ベースだと、長文の途中を編集していても末尾（付録/コード/表など）が拾われて
        // 「今書いている文脈」とずれる。カーソル前なら少なくとも書き手が今いる場所を反映する。
        const cursor = editor.getCursor();
        const beforeCursor = editor.getRange({ line: 0, ch: 0 }, cursor);
        const activePath = info.file?.path ?? null;
        this.lastEditorState = { text: beforeCursor, activePath };
        if (this.paused) return;
        this.debouncer.trigger(beforeCursor, activePath);
      }),
    );

    // タブ切替で lastEditorState を更新（編集が無くても active 切替に追従）
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (!leaf) return;
        const view = leaf.view;
        if (!(view instanceof MarkdownView)) return;
        const editor = view.editor;
        const cursor = editor.getCursor();
        const text = editor.getRange({ line: 0, ch: 0 }, cursor);
        this.lastEditorState = { text, activePath: view.file?.path ?? null };
      }),
    );

    this.registerEvent(this.app.vault.on("modify", (f) => void this.indexer.onFileChange(f)));
    this.registerEvent(this.app.vault.on("create", (f) => void this.indexer.onFileChange(f)));
    this.registerEvent(
      this.app.vault.on("delete", (f) => this.indexer.onFileDelete(f as TAbstractFile)),
    );
    this.registerEvent(
      this.app.vault.on("rename", (f, oldPath) =>
        this.indexer.onFileRename(f as TAbstractFile, oldPath),
      ),
    );

    this.app.workspace.onLayoutReady(() => {
      void this.activateView();
      if (this.isFirstRun) {
        // 初回起動: ウィザードを開いてから indexer を起動（wizard.complete() 内で init を呼ぶ）
        new SetupWizard(this.app, this).open();
      } else {
        void this.indexer.init();
      }
    });
  }

  /** Pause/Resume の切替。view と debouncer 両方に影響 */
  togglePause(): void {
    this.paused = !this.paused;
    if (this.paused) {
      this.debouncer.cancel();
      this.currentAbort?.abort();
    }
    this.view?.refreshPauseIcon();
    new Notice(this.paused ? "Marginalia: paused" : "Marginalia: resumed");
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** デバウンスをスキップして即座に再生成。
   * sidebar の regenerate ボタンを押すと sidebar 自体が active view になるため、
   * `getActiveViewOfType(MarkdownView)` は null を返す。代わりに `workspace.activeEditor` を使うと
   * 直近の editor を sidebar focus 時にも保持してくれる。
   */
  async triggerNow(): Promise<void> {
    const ae = this.app.workspace.activeEditor;
    if (ae?.editor && ae.file) {
      const cursor = ae.editor.getCursor();
      const text = ae.editor.getRange({ line: 0, ch: 0 }, cursor);
      const activePath = ae.file.path;
      this.lastEditorState = { text, activePath };
      this.debouncer.cancel();
      await this.suggestFor(text, activePath, true);
      return;
    }
    if (this.lastEditorState.text) {
      this.debouncer.cancel();
      await this.suggestFor(
        this.lastEditorState.text,
        this.lastEditorState.activePath,
        true,
      );
      return;
    }
    new Notice("Marginalia: no active editor found");
  }

  async onunload(): Promise<void> {
    this.debouncer?.cancel();
    this.currentAbort?.abort();
    await this.indexer?.flush();
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as PersistedData | null;
    // 初回起動判定: 永続データが存在しないか、wizard 未完了
    this.isFirstRun = data === null || !data.settings?.wizardCompleted;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings ?? {});
  }

  async saveSettings(): Promise<void> {
    await this.savePersisted({ settings: this.settings });
    this.client.setEndpoint(this.settings.ollamaEndpoint);
    this.indexer.setExcluded(this.settings.excludedFolders);
    this.indexer.setEmbeddingModel(this.settings.embeddingModel);
    this.debouncer.setWait(this.settings.debounceMs);
  }

  private async savePersisted(patch: Partial<PersistedData>): Promise<void> {
    const existing = ((await this.loadData()) as PersistedData | null) ?? {
      settings: this.settings,
    };
    const next: PersistedData = {
      settings: patch.settings ?? existing.settings ?? this.settings,
      cache: patch.cache ?? existing.cache,
      failedPaths: patch.failedPaths ?? existing.failedPaths,
    };
    await this.saveData(next);
  }

  async rebuildIndex(): Promise<void> {
    new Notice("Marginalia: rebuilding index…");
    // Also clear failed paths so previously-skipped files are retried
    await this.savePersisted({ cache: {}, failedPaths: {} });
    this.indexer = new Indexer({
      vault: this.app.vault,
      client: this.client,
      embeddingModel: this.settings.embeddingModel,
      excludedFolders: this.settings.excludedFolders,
      keepAliveSec: this.settings.keepAliveSec,
      loadCache: async () => null,
      saveCache: async (cache) => {
        await this.savePersisted({ cache });
      },
      loadFailedPaths: async () => null,
      saveFailedPaths: async (failed) => {
        await this.savePersisted({ failedPaths: failed });
      },
      onProgress: (s) => this.view?.setIndexProgress(s),
    });
    await this.indexer.init();
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_MARGINALIA)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_MARGINALIA, active: false });
    }
    if (leaf) workspace.revealLeaf(leaf);
  }

  private async suggestFor(
    rawText: string,
    activePath: string | null,
    manual = false,
  ): Promise<void> {
    if (!this.indexer.getState().ready) {
      if (manual) new Notice("Marginalia: index not ready yet");
      return;
    }
    const trimmed = rawText.trim();
    if (!manual && trimmed.length < this.settings.triggerMinChars) return;
    if (manual && trimmed.length === 0) {
      new Notice("Marginalia: no text in active editor");
      return;
    }

    // Cancel any in-flight round and start a new one
    this.currentAbort?.abort();
    const ac = new AbortController();
    this.currentAbort = ac;

    // 大きなコードブロックを剥がしてから末尾を取る（長文に巨大なコード付録があるケースの対処）
    const tail = stripLargeCodeBlocks(rawText).slice(-this.settings.contextWindowChars);

    // top-K に余裕を持たせる: 編集中ファイル除外 + レンズ間 dedup を吸収
    const queryK = this.settings.topK + LENSES.length + 1;

    let allCandidates: NoteEmbedding[];
    try {
      allCandidates = await this.indexer.query(tail, queryK);
    } catch (e) {
      if (ac.signal.aborted) {
        // 新しい round に交代される直前で query が中断された
        return;
      }
      this.view?.renderError(e instanceof Error ? e.message : String(e));
      return;
    }
    if (ac.signal.aborted) return;

    // Bug 2: 編集中ノート自身を候補から除外（自己参照防止）
    if (activePath) {
      allCandidates = allCandidates.filter((c) => c.path !== activePath);
    }

    if (allCandidates.length === 0) {
      this.view?.renderEmpty("No candidates.");
      return;
    }

    const lenses = LENSES;
    this.view?.beginRound(lenses);

    const usedPaths = new Set<string>();
    for (const lens of lenses) {
      if (ac.signal.aborted) {
        // 新しい round に置き換わる場合は新側が beginRound で reset するので何もしない。
        // 念のため、まだ pending のスロットを「中断」マークにしておく。
        this.view?.skipPending("cancelled");
        return;
      }
      const filtered = allCandidates.filter((c) => !usedPaths.has(c.path));
      if (filtered.length === 0) {
        this.view?.errorSlot(lens, "no candidates left");
        continue;
      }
      const messages = buildMessages(tail, filtered, this.settings.outputLanguage, lens);
      try {
        const reply = await this.client.chat(messages, this.settings.reasoningModel, {
          numCtx: this.settings.numCtx,
          temperature: 0.5,
          keepAliveSec: this.settings.keepAliveSec,
          thinking: this.settings.enableThinking,
          signal: ac.signal,
        });
        if (ac.signal.aborted) {
          this.view?.skipPending("cancelled");
          return;
        }
        const sug = parseSuggestion(reply);
        if (!sug) {
          this.view?.errorSlot(lens, "could not parse response");
          console.warn("[Marginalia] failed to parse:", reply);
          continue;
        }
        sug.reason = lens; // align reason with lens

        // Abstain: model decided no candidate fits
        if (!sug.question.trim()) {
          this.view?.errorSlot(lens, "no fitting candidate");
          continue;
        }

        // sourcePath 解決: markdown link 剥がし → exact → NFKC → basename
        const matched = sug.sourcePath
          ? resolveCandidatePath(filtered, sug.sourcePath)
          : null;
        if (sug.sourcePath && !matched) {
          console.warn(
            `[Marginalia] sourcePath hallucinated for lens="${lens}":`,
            sug.sourcePath,
            "→ blanking",
          );
          sug.sourcePath = "";
          sug.evidence = "";
        } else if (matched) {
          sug.sourcePath = matched.path; // canonical path に正規化
        }

        // evidence が候補本文に実在するかを正規化込み substring 検証
        if (sug.evidence && matched) {
          if (!evidenceMatchesExcerpt(matched.excerpt, sug.evidence)) {
            console.warn(
              `[Marginalia] evidence not found in candidate "${matched.path}" (lens="${lens}"):`,
              sug.evidence,
            );
            sug.evidence = "";
          }
        }

        if (sug.sourcePath) usedPaths.add(sug.sourcePath);
        this.view?.fillSlot(lens, sug);
      } catch (e) {
        if (ac.signal.aborted) {
          this.view?.skipPending("cancelled");
          return;
        }
        const msg = e instanceof Error ? e.message : String(e);
        // AbortError here = internal timeout (300s). Outer is not aborted in this branch.
        const friendly = msg.includes("aborted") ? "response timeout (5min)" : msg;
        this.view?.errorSlot(lens, friendly);
        console.error("[Marginalia] suggest failed", lens, e);
      }
    }

    if (this.currentAbort === ac) this.currentAbort = null;
  }
}
