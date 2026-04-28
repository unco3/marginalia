# Marginalia

> Friction at the margin, not answers.

An Obsidian plugin that, while you write, surfaces past notes from your vault as **one-line questions** — focused on contradictions, structural homomorphisms, and recurring patterns. It does not summarize, complete, or answer. It interrupts your writing just enough to widen your view.

Powered by a local LLM via [Ollama](https://ollama.com/). Your notes never leave your machine.

---

## What it does

You write. After you stop typing for a few seconds, a side panel quietly fills three slots:

| Lens | Purpose |
|---|---|
| **矛盾 / Contradiction** | A past note that contradicts or undermines what you are writing |
| **同型 / Isomorphism** | A note from a different domain whose **structure** mirrors yours |
| **反復 / Recurrence** | Evidence that you keep returning to this same theme or shape |

Each suggestion comes with a source note link and a short verbatim quote. If the model can't ground a suggestion in your actual notes, it abstains — and you see that honestly.

This is not a chat. It is not autocomplete. It is **friction**.

---

## Why this exists

Most "AI for notes" tools optimize for **retrieval** ("find the relevant note") or **synthesis** ("summarize this"). Both pull you toward what is similar.

Marginalia pushes the other way. The valuable connection is rarely the most semantically similar one. It is the contradiction you forgot you wrote, or the structural pattern that links immune-system / Git-conflict-resolution / Hebbian-learning. Vector search alone cannot find these. A local LLM, given a curated short-list of candidates, sometimes can.

---

## Requirements

- Obsidian **1.5.0+** (desktop only — relies on local network)
- [Ollama](https://ollama.com/download) running somewhere reachable
- An embedding model: `bge-m3` recommended (multilingual, 1.2GB)
- A reasoning model: see the tier table below

```bash
ollama pull bge-m3
# Then pick a reasoning model that fits your VRAM:
ollama pull qwen2.5:14b   # recommended baseline
```

Ollama can run on the same machine (`http://localhost:11434`) or remotely via Tailscale / LAN.

### Reasoning model tiers

The reasoning model size has a large effect on suggestion quality, especially the **isomorphism** lens, which needs strong cross-domain abstraction.

| Tier | Examples | What you get |
|---|---|---|
| Minimum (7B-class) | `qwen2.5:7b`, `llama3.1:8b`, `gemma2:9b` | Works. Contradiction lens is fine. Isomorphism is often weak or forced. |
| Recommended (14B-32B-class) | `qwen2.5:14b`, `qwen2.5:32b`, `mistral-small:24b` | Reliable contradiction and recurrence. Isomorphism becomes hit-or-miss interesting. |
| Best (MoE 30B+) | `qwen3:30b-a3b`, larger MoE variants | Sharp structural insights at MoE-level inference speed. |

If you have the VRAM, go larger. The questions get noticeably sharper and more grounded.

---

## Install

Marginalia is currently in **beta** and not yet listed in Obsidian's Community Plugins directory. Install via BRAT (recommended) or manually.

### Option A: BRAT (recommended for beta)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) (Beta Reviewer's Auto-update Tester) is the standard way to install Obsidian plugins distributed via GitHub. It also handles auto-updates as new releases land.

1. **Install BRAT**: `Settings` → `Community plugins` → `Browse` → search `BRAT` → install **Obsidian42 - BRAT** by TfTHacker → enable.
2. **Add Marginalia**: `Settings` → `BRAT` → `Add Beta plugin` → paste:

   ```
   unco3/marginalia
   ```

   then click **Add Plugin**. BRAT downloads `main.js`, `manifest.json`, `styles.css` from the latest release into `<vault>/.obsidian/plugins/marginalia/`.
3. **Enable Marginalia**: `Settings` → `Community plugins` → toggle **Marginalia** on.
4. The setup wizard launches automatically. See [First-run setup](#first-run-setup) below.

BRAT will check for updates at Obsidian startup. To force a check: command palette → `BRAT: Check for updates to all beta plugins`.

To pin a specific version: in BRAT settings, edit Marginalia's entry and set a `Frozen version` (e.g. `0.1.0`).

### Option B: Manual install

1. Download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/unco3/marginalia/releases/latest).
2. Create `<vault>/.obsidian/plugins/marginalia/` and drop the three files in.
3. In Obsidian: `Settings` → `Community plugins` → reload list → enable **Marginalia**.

This route does not auto-update; you re-download files for each release.

### First-run setup

On first enable, a wizard opens:

1. **Welcome** → Next.
2. **Step 1/2 · Ollama connection**: enter your endpoint URL (default `http://localhost:11434`). Click **Test → Next**. You should see `✓ Connected · N models found`.
3. **Step 2/2 · Choose models**: pick your embedding model (recommended `bge-m3`) and reasoning model (see the [tier table](#reasoning-model-tiers) above) from the dropdowns auto-populated from your Ollama instance.
4. Click **Finish**. Initial vault indexing starts immediately. Progress shows in the right side panel (e.g. `indexing… 320/694`). For 500–1000 notes expect roughly one to a few minutes depending on hardware.

Once indexing finishes, start writing. Suggestions appear after a brief pause.

### Pre-flight: Ollama

Before enabling Marginalia, make sure Ollama is running and has the models pulled:

```bash
# Required (embedding)
ollama pull bge-m3

# Reasoning model — pick one tier above your VRAM allows
ollama pull qwen2.5:14b
```

If Ollama is not running:

```bash
ollama serve
```

(On most installs Ollama runs as a background service, so this is rarely needed.)

### Troubleshooting

- **BRAT: "Plugin not found" or no release error** — verify the repo string is exactly `unco3/marginalia` and that the [Releases page](https://github.com/unco3/marginalia/releases) lists at least one release with `main.js`, `manifest.json`, `styles.css` as assets.
- **Indexing stuck at `0/N`** — Ollama is unreachable. Open the Obsidian developer console (`Cmd/Ctrl + Option + I`), filter by `Marginalia`, check the error. Adjust the endpoint in `Settings → Marginalia` and run `Marginalia: Rebuild index` from the command palette.
- **Setup wizard doesn't appear** — wizard runs once. To re-open: command palette → `Marginalia: Open setup wizard`.
- **"No active editor found" when clicking 🔄** — fixed in versions after `0.1.0`. Update via BRAT.

### Uninstall

1. `Settings` → `Community plugins` → toggle Marginalia off.
2. `Settings` → `BRAT` → `Beta Plugin List` → click **Delete** next to Marginalia.
3. Optionally remove `<vault>/.obsidian/plugins/marginalia/` to delete the embedding cache.

---

## Usage

- **Just write.** Suggestions appear automatically after a debounce.
- **Side panel** (right by default): three slots, one per lens
- **Source link** clicks open the cited note
- **🔄 button**: regenerate now (skip the debounce)
- **⏸ button**: pause auto-suggestions (manual regenerate still works)

### Commands (palette)

- `Marginalia: Open Marginalia pane`
- `Marginalia: Toggle pause`
- `Marginalia: Regenerate suggestions now`
- `Marginalia: Rebuild index`
- `Marginalia: Open setup wizard`

---

## Visual cues

- **Solid accent border** on the left → the suggestion is grounded in a real candidate note (verified)
- **Dashed gray border** + "モデルの自前推論" label → the model couldn't find a strong candidate; the question is its own riff. Hover for explanation.
- **Italic blockquote** under a question → a verbatim quote from the cited note (substring-verified against the source)
- **No quote shown** → the model either omitted one or its quote failed verification

---

## Privacy

All processing happens on your Ollama server. Marginalia makes HTTP requests only to the endpoint you configure. No telemetry, no third-party APIs.

If your Ollama is on `localhost`, nothing leaves the machine. If it's remote (LAN / VPN), only that endpoint receives the data.

---

## Configuration

All settings are in **Settings → Marginalia**:

| Setting | Default | Notes |
|---|---|---|
| Ollama endpoint | `http://localhost:11434` | |
| Embedding model | `bge-m3` | Used to shortlist candidates |
| Reasoning model | `qwen2.5:7b` | Generates the questions |
| `num_ctx` | `32768` | Adjust for your reasoning model |
| Debounce (ms) | `4000` | Quiet time before suggestion |
| Top-K candidates | `8` | Sent to the reasoning model |
| Trigger min chars | `100` | Below this, no suggestion |
| Context window chars | `1500` | Tail of your writing sent to the model |
| Excluded folders | `[]` | CSV. e.g. `Clippings,Templates` |
| Output language | `auto` | `auto` (match input) or `ja` |
| Thinking mode | off | Enable for deeper reasoning (slower) |
| Keep alive (sec) | `1800` | Keep model loaded in Ollama |

---

## Known limitations

- **Latency**: Each round is 3 sequential LLM calls. With streaming enabled the first question starts appearing within seconds, but the full round still takes 15–40s on warm 7B models. Use ⏸ if it interrupts your flow.
- **Retrieval is embedding-only** for now. Candidate shortlist comes from `bge-m3` cosine top-K. The isomorphism lens, which wants structurally distant matches, is partially constrained by this. See [Roadmap](#roadmap).
- **Settings UI is partly Japanese**. View, wizard, and command labels are English; settings tab descriptions are still mixed. Full English i18n is on the roadmap.
- **Desktop only**. Mobile cannot reach a local LLM.
- **Quality varies** with your reasoning model. Larger models give sharper, more grounded questions.

---

## Roadmap

See [issue #1](https://github.com/unco3/marginalia/issues/1) for the full tracker.

- [x] Streamed responses (tokens render as they arrive) — v0.2
- [x] Lens reorder for fastest-first display — v0.2
- [ ] Settings tab full English i18n — v0.2
- [ ] Per-suggestion 👍/👎 feedback — v0.3
- [ ] Abstract-summary embeddings (decouple "what it's about" from "what it does") — v0.3
- [ ] MMR / random injection for candidate diversity — v0.3
- [ ] Per-lens retrieval strategies — v0.3
- [ ] Evaluation framework (planted structural pairs, recall measurement) — v0.4
- [ ] Per-lens enable/disable, pinned history — later
- [ ] Submission to Obsidian Community Plugins — v0.4

---

## Development

```bash
pnpm install
pnpm dev   # writes to <vault>/.obsidian/plugins/marginalia/, watches
pnpm build # production build
```

To target a different vault during development:

```bash
OBSIDIAN_VAULT_PATH=/path/to/vault pnpm dev
```

### File structure

```
src/
├── main.ts          Plugin entry, editor-change loop, commands
├── settings.ts      Settings + SettingTab UI
├── ollama-client.ts /api/embed, /api/chat
├── indexer.ts       Vault scan, embedding cache, cosine top-K
├── view.ts          Right side panel (ItemView)
├── prompt.ts        Prompt builder + JSON parser + fuzzy match helpers
├── debounce.ts      editor-change debouncer
├── wizard.ts        First-run setup modal
└── types.ts         Shared types
```

---

## Acknowledgments

- [Ollama](https://ollama.com/) for making local LLMs trivial to run
- [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3) for multilingual embeddings
- The Qwen team for open MoE models that fit on a single consumer GPU

---

## License

MIT — see [LICENSE](LICENSE)
