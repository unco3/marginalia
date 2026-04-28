import { App, Modal, Notice, Setting } from "obsidian";
import type MarginaliaPlugin from "./main";

interface OllamaModel {
  name: string;
  details?: { family?: string };
}

const EMBED_PATTERN = /embed|bge|nomic|gte|mxbai|granite-embed|snowflake|arctic|paraphrase/i;

export class SetupWizard extends Modal {
  private plugin: MarginaliaPlugin;
  private endpoint: string;
  private models: OllamaModel[] = [];
  private embedModel: string;
  private reasoningModel: string;
  private step: 0 | 1 | 2 = 0;

  constructor(app: App, plugin: MarginaliaPlugin) {
    super(app);
    this.plugin = plugin;
    this.endpoint = plugin.settings.ollamaEndpoint;
    this.embedModel = plugin.settings.embeddingModel;
    this.reasoningModel = plugin.settings.reasoningModel;
  }

  onOpen() {
    this.modalEl.addClass("marginalia-wizard");
    this.renderStep();
  }

  private renderStep() {
    this.contentEl.empty();
    this.titleEl.empty();
    if (this.step === 0) this.renderWelcome();
    else if (this.step === 1) this.renderEndpoint();
    else this.renderModels();
  }

  private renderWelcome() {
    this.titleEl.setText("Welcome to Marginalia");
    const c = this.contentEl;
    c.createEl("p", {
      text:
        "Marginalia surfaces past notes from your vault as one-line questions while you write — quietly, in the side panel.",
    });
    c.createEl("p", {
      text: "Not answers. Not summaries. Friction at the margin: contradictions, structural homomorphisms, recurring patterns.",
      cls: "marginalia-wizard-tagline",
    });
    c.createEl("p", {
      text: "Setup needs your Ollama server. Takes about 30 seconds.",
      cls: "marginalia-wizard-note",
    });

    const buttons = c.createDiv({ cls: "marginalia-wizard-buttons" });
    const skipBtn = buttons.createEl("button", { text: "Skip (configure manually)" });
    skipBtn.addEventListener("click", () => void this.complete(false));
    const nextBtn = buttons.createEl("button", { text: "Next →", cls: "mod-cta" });
    nextBtn.addEventListener("click", () => {
      this.step = 1;
      this.renderStep();
    });
  }

  private renderEndpoint() {
    this.titleEl.setText("Step 1/2 · Ollama connection");
    const c = this.contentEl;
    c.createEl("p", {
      text: "Enter the URL of your Ollama server.",
    });
    c.createEl("p", {
      cls: "marginalia-wizard-note",
      text:
        "Local: http://localhost:11434 — Remote (LAN/Tailscale): http://<host>:11434",
    });

    new Setting(c)
      .setName("Endpoint URL")
      .addText((t) =>
        t
          .setValue(this.endpoint)
          .setPlaceholder("http://localhost:11434")
          .onChange((v) => {
            this.endpoint = v.trim();
          }),
      );

    const status = c.createDiv({ cls: "marginalia-wizard-status" });

    const buttons = c.createDiv({ cls: "marginalia-wizard-buttons" });
    const back = buttons.createEl("button", { text: "← Back" });
    back.addEventListener("click", () => {
      this.step = 0;
      this.renderStep();
    });
    const test = buttons.createEl("button", { text: "Test → Next", cls: "mod-cta" });
    test.addEventListener("click", async () => {
      status.removeClass("marginalia-wizard-error");
      status.removeClass("marginalia-wizard-success");
      status.setText("Connecting…");
      try {
        const url = `${this.endpoint.replace(/\/$/, "")}/api/tags`;
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 8000);
        const res = await fetch(url, { signal: ac.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { models?: OllamaModel[] };
        this.models = data.models ?? [];
        if (this.models.length === 0) {
          status.setText(
            "Connected, but no models found. Pull one first: `ollama pull bge-m3`",
          );
          status.addClass("marginalia-wizard-error");
          return;
        }
        status.setText(`✓ Connected · ${this.models.length} models found`);
        status.addClass("marginalia-wizard-success");
        window.setTimeout(() => {
          this.step = 2;
          this.renderStep();
        }, 700);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        status.setText(`× Failed: ${msg}`);
        status.addClass("marginalia-wizard-error");
        const help = c.createDiv({ cls: "marginalia-wizard-help" });
        help.createEl("p", {
          text: "Ollama may not be running, or the URL is wrong.",
        });
        const link = help.createEl("a", {
          text: "Install Ollama →",
          href: "https://ollama.com/download",
        });
        link.setAttribute("target", "_blank");
      }
    });
  }

  private renderModels() {
    this.titleEl.setText("Step 2/2 · Choose models");
    const c = this.contentEl;
    c.createEl("p", { text: "Pick two models from what you have installed." });

    const embedCandidates = this.models.filter((m) => EMBED_PATTERN.test(m.name));
    const reasoningCandidates = this.models.filter((m) => !EMBED_PATTERN.test(m.name));

    if (embedCandidates.length === 0) {
      const warn = c.createDiv({ cls: "marginalia-wizard-error" });
      warn.setText(
        "⚠ No embedding model found. Pull one: `ollama pull bge-m3` (multilingual, recommended).",
      );
    }

    new Setting(c)
      .setName("Embedding model")
      .setDesc("Used to shortlist candidate notes. bge-m3 recommended.")
      .addDropdown((dd) => {
        const list = embedCandidates.length > 0 ? embedCandidates : this.models;
        for (const m of list) dd.addOption(m.name, m.name);
        const initial =
          list.find((m) => m.name === this.embedModel)?.name ?? list[0]?.name ?? "";
        if (initial) {
          dd.setValue(initial);
          this.embedModel = initial;
        }
        dd.onChange((v) => {
          this.embedModel = v;
        });
      });

    new Setting(c)
      .setName("Reasoning model")
      .setDesc("Generates the one-line questions. Larger / MoE models give sharper output.")
      .addDropdown((dd) => {
        const list = reasoningCandidates.length > 0 ? reasoningCandidates : this.models;
        for (const m of list) dd.addOption(m.name, m.name);
        const initial =
          list.find((m) => m.name === this.reasoningModel)?.name ?? list[0]?.name ?? "";
        if (initial) {
          dd.setValue(initial);
          this.reasoningModel = initial;
        }
        dd.onChange((v) => {
          this.reasoningModel = v;
        });
      });

    const buttons = c.createDiv({ cls: "marginalia-wizard-buttons" });
    const back = buttons.createEl("button", { text: "← Back" });
    back.addEventListener("click", () => {
      this.step = 1;
      this.renderStep();
    });
    const finish = buttons.createEl("button", { text: "Finish", cls: "mod-cta" });
    finish.addEventListener("click", () => void this.complete(true));
  }

  private async complete(saveSelection: boolean) {
    if (saveSelection) {
      this.plugin.settings.ollamaEndpoint = this.endpoint;
      if (this.embedModel) this.plugin.settings.embeddingModel = this.embedModel;
      if (this.reasoningModel) this.plugin.settings.reasoningModel = this.reasoningModel;
    }
    this.plugin.settings.wizardCompleted = true;
    await this.plugin.saveSettings();
    new Notice("Marginalia: setup complete. Indexing started.");
    this.close();
    void this.plugin.indexer.init();
  }
}
