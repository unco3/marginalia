import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type MarginaliaPlugin from "./main";
import type { IndexState, Lens, Suggestion } from "./types";

export const VIEW_TYPE_MARGINALIA = "marginalia-view";

const REASON_LABEL: Record<string, string> = {
  contradiction: "Contradiction",
  isomorphism: "Isomorphism",
  pattern: "Recurrence",
  unknown: "—",
};

interface SlotState {
  el: HTMLElement;
  startedAt: number;
  timerId: number | null;
}

export class MarginaliaView extends ItemView {
  private plugin: MarginaliaPlugin;
  private headerEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private pauseBtn: HTMLElement | null = null;
  private regenBtn: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private slots: Map<Lens, SlotState> = new Map();
  private indexState: IndexState = { ready: false, total: 0, embedded: 0, errors: 0 };
  private roundActive = false;
  private completedInRound = 0;
  private totalInRound = 0;

  constructor(leaf: WorkspaceLeaf, plugin: MarginaliaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_MARGINALIA;
  }

  getDisplayText(): string {
    return "Marginalia";
  }

  getIcon(): string {
    return "edit-3";
  }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass("marginalia-view");

    this.headerEl = root.createDiv({ cls: "marginalia-header" });

    const left = this.headerEl.createDiv({ cls: "marginalia-header-left" });
    this.pauseBtn = left.createEl("button", {
      cls: "marginalia-icon-btn",
      attr: { "aria-label": "Pause / Resume" },
    });
    this.pauseBtn.addEventListener("click", () => this.plugin.togglePause());
    this.refreshPauseIcon();

    this.statusEl = left.createDiv({ cls: "marginalia-status", text: "—" });

    const right = this.headerEl.createDiv({ cls: "marginalia-header-right" });
    this.regenBtn = right.createEl("button", {
      cls: "marginalia-icon-btn",
      attr: { "aria-label": "Regenerate now" },
    });
    setIcon(this.regenBtn, "refresh-cw");
    this.regenBtn.addEventListener("click", () => void this.plugin.triggerNow());

    this.listEl = root.createDiv({ cls: "marginalia-list" });
    this.renderEmpty("Write at least 100 characters to surface questions from your past notes.");
    this.refreshStatus();
  }

  async onClose(): Promise<void> {
    this.clearAllTimers();
    this.headerEl = null;
    this.statusEl = null;
    this.pauseBtn = null;
    this.regenBtn = null;
    this.listEl = null;
    this.slots.clear();
  }

  /** Plugin から pause 状態が変わった時に呼ばれる */
  refreshPauseIcon(): void {
    if (!this.pauseBtn) return;
    setIcon(this.pauseBtn, this.plugin.isPaused() ? "play" : "pause");
    this.refreshStatus();
  }

  setIndexProgress(s: IndexState): void {
    this.indexState = s;
    this.refreshStatus();
  }

  private refreshStatus(): void {
    if (!this.statusEl) return;
    const parts: string[] = [];
    if (this.plugin.isPaused()) {
      parts.push("⏸ paused");
    } else if (!this.indexState.ready) {
      parts.push(
        `indexing… ${this.indexState.embedded}/${this.indexState.total}${
          this.indexState.errors > 0 ? ` (err: ${this.indexState.errors})` : ""
        }`,
      );
    } else if (this.roundActive) {
      parts.push(`thinking ${this.completedInRound}/${this.totalInRound}`);
    } else {
      parts.push(
        `ready · ${this.indexState.embedded} notes${
          this.indexState.errors > 0 ? ` · err ${this.indexState.errors}` : ""
        }`,
      );
    }
    this.statusEl.setText(parts.join(" "));
  }

  renderEmpty(text: string): void {
    if (!this.listEl) return;
    this.clearAllTimers();
    this.listEl.empty();
    this.slots.clear();
    this.listEl.createDiv({ cls: "marginalia-empty", text });
    this.roundActive = false;
    this.completedInRound = 0;
    this.totalInRound = 0;
    this.refreshStatus();
  }

  renderError(msg: string): void {
    if (!this.listEl) return;
    this.clearAllTimers();
    this.listEl.empty();
    this.slots.clear();
    this.listEl.createDiv({ cls: "marginalia-empty", text: `× ${msg}` });
    this.roundActive = false;
    this.refreshStatus();
  }

  beginRound(lenses: readonly Lens[]): void {
    if (!this.listEl) return;
    this.clearAllTimers();
    this.listEl.empty();
    this.slots.clear();
    this.roundActive = true;
    this.completedInRound = 0;
    this.totalInRound = lenses.length;
    for (const lens of lenses) {
      const slot = this.listEl.createDiv({ cls: "marginalia-item marginalia-pending" });
      const header = slot.createDiv({ cls: "marginalia-item-header" });
      header.createSpan({ cls: "marginalia-reason", text: REASON_LABEL[lens] ?? lens });
      header.createSpan({ cls: "marginalia-elapsed", text: "0s" });
      slot.createDiv({ cls: "marginalia-question marginalia-thinking", text: "…thinking" });
      const state: SlotState = { el: slot, startedAt: Date.now(), timerId: null };
      state.timerId = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
        const elapsedEl = slot.querySelector(".marginalia-elapsed") as HTMLElement | null;
        if (elapsedEl) elapsedEl.setText(`${elapsed}s`);
      }, 1000);
      this.slots.set(lens, state);
    }
    this.refreshStatus();
  }

  fillSlot(lens: Lens, s: Suggestion): void {
    const state = this.slots.get(lens);
    if (!state) return;
    this.stopSlotTimer(state);
    const slot = state.el;
    slot.removeClass("marginalia-pending");
    slot.addClass(s.sourcePath ? "marginalia-grounded" : "marginalia-ungrounded");
    slot.empty();

    const header = slot.createDiv({ cls: "marginalia-item-header" });
    header.createSpan({ cls: "marginalia-reason", text: REASON_LABEL[lens] ?? lens });
    if (s.sourcePath) {
      const link = header.createEl("a", {
        cls: "marginalia-source",
        text: s.sourcePath,
      });
      link.addEventListener("click", (ev) => {
        ev.preventDefault();
        const file = this.plugin.app.vault.getFileByPath(s.sourcePath);
        if (file) {
          this.plugin.app.workspace.getLeaf(false).openFile(file);
        }
      });
    } else {
      const tag = header.createSpan({
        cls: "marginalia-source marginalia-source-missing",
        text: "model's own riff",
      });
      tag.setAttr(
        "title",
        "Not grounded in any candidate note. The model generated this on its own. Source verification was not possible.",
      );
    }

    slot.createDiv({ cls: "marginalia-question", text: s.question });
    if (s.evidence) {
      slot.createDiv({ cls: "marginalia-evidence", text: `“${s.evidence}”` });
    }
    this.completedInRound++;
    if (this.completedInRound >= this.totalInRound) this.roundActive = false;
    this.refreshStatus();
  }

  errorSlot(lens: Lens, msg: string): void {
    const state = this.slots.get(lens);
    if (!state) return;
    this.stopSlotTimer(state);
    const slot = state.el;
    slot.removeClass("marginalia-pending");
    slot.addClass("marginalia-slot-error");
    slot.empty();
    const header = slot.createDiv({ cls: "marginalia-item-header" });
    header.createSpan({ cls: "marginalia-reason", text: REASON_LABEL[lens] ?? lens });
    slot.createDiv({ cls: "marginalia-empty", text: `× ${msg}` });
    this.completedInRound++;
    if (this.completedInRound >= this.totalInRound) this.roundActive = false;
    this.refreshStatus();
  }

  /** outer abort された時、pending スロットを「中断」表示にしてタイマーも停止 */
  skipPending(reason = "cancelled"): void {
    for (const [, state] of this.slots) {
      if (state.el.hasClass("marginalia-pending")) {
        this.stopSlotTimer(state);
        state.el.removeClass("marginalia-pending");
        state.el.addClass("marginalia-slot-error");
        const thinking = state.el.querySelector(".marginalia-thinking");
        if (thinking) (thinking as HTMLElement).setText(reason);
        const elapsed = state.el.querySelector(".marginalia-elapsed");
        if (elapsed) (elapsed as HTMLElement).setText("");
      }
    }
    this.roundActive = false;
    this.refreshStatus();
  }

  private stopSlotTimer(state: SlotState): void {
    if (state.timerId !== null) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  private clearAllTimers(): void {
    for (const state of this.slots.values()) this.stopSlotTimer(state);
  }
}
