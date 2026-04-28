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

## Setup

1. Install Marginalia from Community Plugins (or via [BRAT](https://github.com/TfTHacker/obsidian42-brat) for beta)
2. Enable the plugin
3. The setup wizard opens on first launch:
   - Confirm the Ollama endpoint
   - Pick your embedding and reasoning models
4. Initial vault indexing runs in the background (a few minutes for ~700 notes)
5. Start writing. Suggestions appear after a few seconds of pause.

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

- **Latency**: Each round is 3 sequential LLM calls. With Qwen 7B-class models on a decent GPU, expect 15–40s for a full round. Use ⏸ if it interrupts your flow.
- **UI is currently Japanese**. English UI is on the roadmap.
- **Desktop only**. Mobile cannot reach a local LLM.
- **Quality varies** with your reasoning model. Larger models give sharper, more grounded questions.

---

## Roadmap

- [ ] English UI (i18n)
- [ ] Per-lens enable/disable
- [ ] Pinned history pane (save insights for later)
- [ ] Per-lens "regenerate this one" action
- [ ] Streamed responses (show tokens as they arrive)
- [ ] MMR for candidate diversity (improve isomorphism lens)

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
