import { App, PluginSettingTab, Setting } from "obsidian";
import type MarginaliaPlugin from "./main";

export interface PluginSettings {
  ollamaEndpoint: string;
  embeddingModel: string;
  reasoningModel: string;
  numCtx: number;
  debounceMs: number;
  topK: number;
  triggerMinChars: number;
  contextWindowChars: number;
  excludedFolders: string[];
  outputLanguage: "ja" | "auto";
  enableThinking: boolean;
  keepAliveSec: number;
  wizardCompleted: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  ollamaEndpoint: "http://localhost:11434",
  embeddingModel: "bge-m3",
  reasoningModel: "qwen2.5:7b",
  numCtx: 32768,
  debounceMs: 4000,
  topK: 8,
  triggerMinChars: 100,
  contextWindowChars: 1500,
  excludedFolders: [],
  outputLanguage: "auto",
  enableThinking: false,
  keepAliveSec: 1800,
  wizardCompleted: false,
};

export class MarginaliaSettingTab extends PluginSettingTab {
  plugin: MarginaliaPlugin;

  constructor(app: App, plugin: MarginaliaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Marginalia" });

    new Setting(containerEl)
      .setName("Ollama endpoint")
      .setDesc("ws (Tailscale) のデフォルト: http://100.92.242.85:11434")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.ollamaEndpoint)
          .onChange(async (v) => {
            this.plugin.settings.ollamaEndpoint = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Embedding model")
      .setDesc("候補20本に絞り込むための埋め込みモデル")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.embeddingModel)
          .onChange(async (v) => {
            this.plugin.settings.embeddingModel = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Reasoning model")
      .setDesc("一行の問いを生成する LLM。MoE: qwen3.6-64k / Dense fallback: qwen3.6-27b-128k")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.reasoningModel)
          .onChange(async (v) => {
            this.plugin.settings.reasoningModel = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("num_ctx")
      .setDesc("LLM のコンテキスト長。MoE は 65536 推奨")
      .addText((t) =>
        t
          .setValue(String(this.plugin.settings.numCtx))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (Number.isFinite(n) && n > 0) {
              this.plugin.settings.numCtx = n;
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Debounce (ms)")
      .setDesc("タイプ停止からの待機時間。書くリズムを壊さない長さ")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.debounceMs)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n >= 500) {
            this.plugin.settings.debounceMs = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Top-K candidates")
      .setDesc("LLM に渡す候補ノート数")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.topK)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n > 0) {
            this.plugin.settings.topK = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Trigger min chars")
      .setDesc("この字数未満ではトリガしない")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.triggerMinChars)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n >= 0) {
            this.plugin.settings.triggerMinChars = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Context window chars")
      .setDesc("現在編集中テキストの末尾から何字を埋め込みに使うか")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.contextWindowChars)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n > 0) {
            this.plugin.settings.contextWindowChars = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Excluded folders (CSV)")
      .setDesc("カンマ区切りで除外フォルダを指定")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.excludedFolders.join(","))
          .onChange(async (v) => {
            this.plugin.settings.excludedFolders = v
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Output language")
      .setDesc("出力言語")
      .addDropdown((d) =>
        d
          .addOption("ja", "日本語")
          .addOption("auto", "Auto")
          .setValue(this.plugin.settings.outputLanguage)
          .onChange(async (v) => {
            this.plugin.settings.outputLanguage = v as "ja" | "auto";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Enable thinking mode")
      .setDesc("MoE の thinking モードを有効化（深いが遅い）")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.enableThinking).onChange(async (v) => {
          this.plugin.settings.enableThinking = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Keep alive (sec)")
      .setDesc("Ollama にモデルを常駐させる秒数。長いほど初回呼び出し以降が速い")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.keepAliveSec)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n >= 0) {
            this.plugin.settings.keepAliveSec = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    containerEl.createEl("h3", { text: "インデックス" });
    new Setting(containerEl)
      .setName("Rebuild full index")
      .setDesc("vault 全 markdown を再走査して埋め込みを作り直す")
      .addButton((b) =>
        b.setButtonText("Rebuild").onClick(async () => {
          await this.plugin.rebuildIndex();
        }),
      );
  }
}
