# Marginalia

> 答えではなく、視野の端に摩擦を。

書いている最中に、あなたの過去ノートから「一行の問い」をサイドパネルへ静かに浮かび上がらせる Obsidian プラグイン。狙うのは矛盾、構造的同型、繰り返しのパターン。要約も、補完も、答えもしない。書く流れに小さな摩擦だけを差し込む。

ローカル LLM（[Ollama](https://ollama.com/)）で動く。ノートが手元から外に出ることはない。

[English README](./README.md)

---

## 何をするか

書く。数秒タイプを止めると、サイドパネルに3つのスロットが静かに埋まる。

| レンズ | 役割 |
|---|---|
| **矛盾 / Contradiction** | いま書いている内容と矛盾する／前提を覆す過去ノート |
| **同型 / Isomorphism** | ドメインは違うが**構造**が同じノート |
| **反復 / Recurrence** | 同じテーマや構造に何度も戻っている証拠 |

各提案には出典ノートへのリンクと原文ママの短い引用がつく。候補ノートに根ざせなかった場合、モデルは正直に棄権し、それも UI 上で見える。

これはチャットではない。補完でもない。**摩擦**である。

---

## なぜこれを作ったか

「ノート向け AI」ツールの大半は、検索（関連ノートを見つける）か要約・補完（まとめる、続きを書く）に寄っている。どちらもユーザを「似ているもの」へ引き寄せる。

Marginalia は逆方向に押す。価値ある接続というのは、最も意味的に近い候補ではなく、書いたことすら忘れていた矛盾だったり、免疫系・Git のコンフリクト解決・Hebbian 学習を貫く構造的パターンだったりする。ベクトル検索だけではこうした接続は拾えない。短く絞り込まれた候補リストを与えられたローカル LLM なら、ときに拾える。

---

## 必要なもの

- Obsidian **1.5.0 以上**（デスクトップのみ。ローカル通信が前提）
- 動作中の [Ollama](https://ollama.com/download) サーバ
- 埋め込みモデル: `bge-m3` 推奨（多言語対応、1.2GB）
- 推論モデル: 下記のティア表を参照

```bash
ollama pull bge-m3
# VRAM に合わせて推論モデルを選ぶ:
ollama pull qwen2.5:14b   # 推奨ベースライン
```

Ollama は同じマシン (`http://localhost:11434`) でも、Tailscale や LAN 越しの別マシンでも構わない。

### 推論モデルのティア

推論モデルのサイズは提案の質、特にクロスドメインな抽象化を要する**同型レンズ**の質に大きく影響する。

| ティア | 例 | 得られるもの |
|---|---|---|
| 最低 (7B級) | `qwen2.5:7b`, `llama3.1:8b`, `gemma2:9b` | 動く。矛盾レンズは問題なし。同型レンズは弱いか強引な接続になりがち。 |
| 推奨 (14B–32B級) | `qwen2.5:14b`, `qwen2.5:32b`, `mistral-small:24b` | 矛盾と反復は安定。同型はヒット率半々で面白い接続が出る。 |
| 最良 (MoE 30B+) | `qwen3:30b-a3b`、より大きな MoE | 鋭い構造的洞察を MoE 推論速度で。 |

VRAM に余裕があるなら大きい方を選ぶこと。問いが目に見えて鋭く、かつ根拠を持つようになる。

---

## インストール

Marginalia は現在**ベータ**で、Obsidian の Community Plugins ディレクトリにはまだ掲載されていない。BRAT 経由（推奨）か手動インストールで入れる。

### A: BRAT 経由（ベータ配布の推奨方法）

[BRAT](https://github.com/TfTHacker/obsidian42-brat)（Beta Reviewer's Auto-update Tester）は、GitHub で配布されている Obsidian プラグインを入れるための標準ツール。新しいリリースが出ると自動で更新もしてくれる。

1. **BRAT 本体をインストール**: `Settings` → `Community plugins` → `Browse` → 検索ボックスに `BRAT` → **Obsidian42 - BRAT** by TfTHacker をインストール → 有効化。
2. **Marginalia を追加**: `Settings` → `BRAT` → `Add Beta plugin` で以下を貼り付け:

   ```
   unco3/marginalia
   ```

   そして **Add Plugin** をクリック。BRAT が最新リリースから `main.js` / `manifest.json` / `styles.css` を `<vault>/.obsidian/plugins/marginalia/` にダウンロードする。
3. **Marginalia を有効化**: `Settings` → `Community plugins` → **Marginalia** のトグルを ON。
4. セットアップウィザードが自動で立ち上がる。下記の[初回セットアップ](#初回セットアップ)へ。

BRAT は Obsidian 起動時に更新を自動チェックする。手動で更新を確認したいときは、コマンドパレットから `BRAT: Check for updates to all beta plugins`。

特定バージョンに固定したい場合は、BRAT 設定で Marginalia のエントリを編集し `Frozen version` に `0.1.0` 等を入れる。

### B: 手動インストール

1. [最新リリース](https://github.com/unco3/marginalia/releases/latest)から `main.js` / `manifest.json` / `styles.css` をダウンロード。
2. `<vault>/.obsidian/plugins/marginalia/` を作って3ファイルを置く。
3. Obsidian で `Settings` → `Community plugins` → リストを reload → **Marginalia** を有効化。

このルートは自動更新されない。リリースごとに再ダウンロードが必要。

### 初回セットアップ

有効化と同時にウィザードが開く。

1. **Welcome** → Next。
2. **Step 1/2 · Ollama connection**: エンドポイント URL を入力（デフォルト `http://localhost:11434`）。**Test → Next** をクリック。`✓ Connected · N models found` と出れば成功。
3. **Step 2/2 · Choose models**: ドロップダウンから埋め込みモデル（推奨 `bge-m3`）と推論モデル（[ティア表](#推論モデルのティア)を参照）を選ぶ。Ollama から自動で取得される。
4. **Finish** をクリック。すぐに vault のインデックス構築が始まる。右サイドパネルに進捗が表示（例: `indexing… 320/694`）。500–1000 ノート規模で数十秒〜数分。

完了後は書き始めるだけ。少しタイプを止めると提案が出る。

### 事前準備: Ollama

Marginalia を有効化する前に、Ollama を起動しモデルを pull しておく。

```bash
# 必須（埋め込み）
ollama pull bge-m3

# 推論モデル — VRAM に合わせて選ぶ
ollama pull qwen2.5:14b
```

Ollama が起動していない場合:

```bash
ollama serve
```

（多くの環境では Ollama がバックグラウンドサービスとして動いているため、明示的な起動は不要なことが多い。）

### トラブルシューティング

- **BRAT「Plugin not found」または release エラー** — リポジトリ文字列が `unco3/marginalia` 完全一致か、[Releases ページ](https://github.com/unco3/marginalia/releases)に `main.js` / `manifest.json` / `styles.css` の3点が assets として存在するリリースがあるか確認。
- **インデックスが `0/N` のまま進まない** — Ollama に到達できていない。Obsidian 開発者コンソール（`Cmd/Ctrl + Option + I`）を開き `Marginalia` でフィルタ、エラーを確認。`Settings → Marginalia` でエンドポイントを直し、コマンドパレットから `Marginalia: Rebuild index` で再試行。
- **セットアップウィザードが出ない** — ウィザードは初回のみ。再表示はコマンドパレットから `Marginalia: Open setup wizard`。
- **🔄 クリックで「No active editor found」** — `0.1.0` 以降のバージョンで修正済み。BRAT 経由で更新を。

### アンインストール

1. `Settings` → `Community plugins` で Marginalia をオフ。
2. `Settings` → `BRAT` → `Beta Plugin List` → Marginalia の **Delete** をクリック。
3. 必要なら `<vault>/.obsidian/plugins/marginalia/` を手動削除（埋め込みキャッシュも消える）。

---

## 使い方

- **ただ書く**。デバウンス後に提案が自動で出る。
- **サイドパネル**（デフォルト右）: 3スロット、レンズごとに1つ
- **出典リンク**をクリックで該当ノートへ
- **🔄 ボタン**: デバウンスをスキップして即再生成
- **⏸ ボタン**: 自動提案を一時停止（手動の再生成は引き続き使える）

### コマンド（パレット）

- `Marginalia: Open Marginalia pane`
- `Marginalia: Toggle pause`
- `Marginalia: Regenerate suggestions now`
- `Marginalia: Rebuild index`
- `Marginalia: Open setup wizard`

---

## 視覚的な手がかり

- **左の実線アクセントボーダー** → 提案が実在する候補ノートに根ざしている（検証済み）
- **左の点線グレーボーダー** + 「モデルの自前推論」ラベル → モデルが強い候補を見出せず、自前で問いを生成した。出典の検証はできていない。hover で説明
- **問いの下のイタリック引用** → 出典本文からの原文ママ引用（substring 検証で一致確認済み）
- **引用なし** → モデルが引用を出さなかった、または検証で reject された

---

## プライバシー

すべての処理はあなたが指定した Ollama サーバ上で行われる。Marginalia はそのエンドポイントにのみ HTTP リクエストを送る。テレメトリも、サードパーティ API もない。

Ollama が `localhost` ならデータはマシン外に出ない。リモート（LAN / VPN）の場合はそのエンドポイントだけがデータを受け取る。

---

## 設定

すべての設定は `Settings → Marginalia` にある。

| 設定 | デフォルト | 説明 |
|---|---|---|
| Ollama endpoint | `http://localhost:11434` | |
| Embedding model | `bge-m3` | 候補絞り込み用 |
| Reasoning model | `qwen2.5:7b` | 問いを生成する LLM |
| `num_ctx` | `32768` | 推論モデルに合わせて調整 |
| Debounce (ms) | `4000` | 提案までの待機時間 |
| Top-K candidates | `8` | 推論モデルに渡す候補数 |
| Trigger min chars | `100` | この字数未満ではトリガしない |
| Context window chars | `1500` | 編集中テキストの末尾何字を送るか |
| Excluded folders | `[]` | CSV。例: `Clippings,Templates` |
| Output language | `auto` | `auto`（入力に合わせる）または `ja` |
| Thinking mode | off | より深い推論（遅くなる） |
| Keep alive (sec) | `1800` | Ollama にモデルを常駐させる秒数 |

---

## 既知の制限

- **レイテンシ**: 1ラウンドは3つの逐次 LLM 呼び出し。ストリーミング有効時は最初の問いが数秒で出始めるが、3つすべて揃うまでは warm な 7B モデルで 15〜40秒かかる。気になる場合は ⏸ で止められる。
- **リトリーバが embedding 一本足**: 候補は `bge-m3` のコサイン top-K のみ。構造的に遠いマッチを欲しがる同型レンズはこれに部分的に縛られている。[ロードマップ](#ロードマップ)を参照。
- **設定 UI が一部日本語**: ビュー、ウィザード、コマンドのラベルは英語化済み。Settings タブの説明は混在。完全英語 i18n はロードマップ。
- **デスクトップのみ**: モバイルからローカル LLM には到達できない。
- **品質は推論モデルに依存**: 大きいモデルほど鋭く、根拠のある問いが出る。

---

## ロードマップ

完全な進捗は [issue #1](https://github.com/unco3/marginalia/issues/1) を参照。

- [x] ストリーミング応答（トークン到着順に描画）— v0.2
- [x] レンズ並び替え（速い順に表示）— v0.2
- [ ] Settings タブの完全英語 i18n — v0.2
- [ ] 提案ごとの 👍/👎 フィードバック — v0.3
- [ ] 抽象化サマリ埋め込み（「内容」と「構造」を分離）— v0.3
- [ ] MMR / ランダム注入で候補に多様性を — v0.3
- [ ] レンズごとに異なるリトリーバ戦略 — v0.3
- [ ] 評価フレームワーク（仕込んだ構造ペアでリコール率測定）— v0.4
- [ ] レンズの個別 ON/OFF、ピン留め履歴 — 後日
- [ ] Obsidian Community Plugins への申請 — v0.4

---

## 開発

```bash
pnpm install
pnpm dev   # <vault>/.obsidian/plugins/marginalia/ に書き出して watch
pnpm build # 本番ビルド
```

別 vault を対象にするとき:

```bash
OBSIDIAN_VAULT_PATH=/path/to/vault pnpm dev
```

### ファイル構成

```
src/
├── main.ts          プラグインエントリ、editor-change ループ、コマンド
├── settings.ts      設定 + SettingTab UI
├── ollama-client.ts /api/embed, /api/chat
├── indexer.ts       vault スキャン、埋め込みキャッシュ、cosine top-K
├── view.ts          右サイドパネル (ItemView)
├── prompt.ts        プロンプト構築 + JSON パーサ + fuzzy match
├── debounce.ts      editor-change デバウンサ
├── wizard.ts        初回セットアップモーダル
└── types.ts         共通型
```

---

## 謝辞

- ローカル LLM の運用を簡単にしてくれた [Ollama](https://ollama.com/)
- 多言語対応の埋め込みモデル [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3)
- コンシューマ GPU 1枚で動く MoE モデルを公開し続けている Qwen チーム

---

## ライセンス

MIT — [LICENSE](LICENSE) を参照
