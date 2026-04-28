import type { ChatMessage } from "./ollama-client";
import type { Lens, NoteEmbedding, Suggestion, SuggestionReason } from "./types";

const LENS_INSTRUCTION: Record<Lens, string> = {
  contradiction:
    "今書いている内容と『矛盾する／反例となる／前提を覆す』ものを最優先で選ぶこと。書き手が見落としている逆の角度を一行の問いで突きつけよ。",
  isomorphism:
    "意味やドメインは遠いが『構造が同型』であるものを最優先で選ぶこと。例: 免疫の自己/非自己認識 と Git のコンフリクト解決。なぜそれが構造的に同じかを示唆する一行の問いで返せ。",
  pattern:
    "書き手が同じテーマや構造に『繰り返し戻っている』証拠となるものを最優先で選ぶこと。何度目の回帰かは指摘しなくてよい。回帰のパターン自体を一行の観察で示せ。",
};

const LENS_REASON: Record<Lens, SuggestionReason> = {
  contradiction: "contradiction",
  isomorphism: "isomorphism",
  pattern: "pattern",
};

const EXCERPT_CHARS_PER_CANDIDATE = 1500;

export function buildMessages(
  currentText: string,
  candidates: NoteEmbedding[],
  outputLanguage: "ja" | "auto",
  lens: Lens,
): ChatMessage[] {
  const langLine =
    outputLanguage === "ja"
      ? "出力は必ず日本語。"
      : "出力言語は入力テキストに合わせる。";

  const system = [
    "あなたは、書き手の視野を広げるための「一行の問い」だけを返すアシスタント。",
    "あなたの役割は答えを出すことではなく、書き手に摩擦を与えること。",
    "",
    "今回のレンズ:",
    `- ${LENS_INSTRUCTION[lens]}`,
    "",
    "守るべき制約:",
    "- 出力は必ず一行の問い、または一行の観察のみ。**80字以内を厳守**。複数の節を「において」「ように」等で繋いだ複文は禁止。",
    "- 「答え」を出してはならない。",
    "- **候補ノート本文に実際に書かれていることに必ず根ざすこと**。あなたの一般知識ではなく、与えられた候補本文から具体的な要素を引き出して問いを構築せよ。",
    "- **概念の飛躍禁止**: 質問文には、「現在書いているテキスト」または「選んだ候補本文」のどちらかに明示的に出てくる語彙・概念のみを使え。両方に出てこない比喩や用語（例: ソースにない『RPA化』『免疫系』『顧客』など）を持ち込んではならない。",
    "- レンズの種類に質問が忠実であること。矛盾レンズなら矛盾の指摘、同型レンズなら構造的同型の指摘、反復レンズなら繰り返し回帰の観察に絞れ。レンズに合わない問いを返してはならない。",
    "- 候補を参照するときは path で指すこと。番号や順序で言及してはならない（例: 「候補3」「最初の候補」のような表現を禁ず）。",
    "- `evidence` には、選んだ**候補ノートの本文**（`【現在書いているテキスト】` ではなく `【過去ノート候補】` のセクション内の本文）から、原文ママの短い引用（30字以内）を一つ入れること。",
    "",
    "**棄権ルール（最重要）**:",
    "- 候補ノート群がそのレンズに本当に適合するかを厳しく判定せよ。語彙が共通しているだけ、テーマが近いだけ、では不十分。",
    "- 例えば同型レンズなら、ドメインが遠くかつ抽象構造が同じである必要がある。形だけ似た強引な接続は禁ず。",
    "- 強い接続が見出せない場合は、無理に問いを作らず、`question` と `sourcePath` と `evidence` をすべて空文字にして返せ。",
    "- 経験則として、与えられた候補のうち本当にレンズに該当するのは 0〜2 本程度。3本以上が「該当する」と感じたら基準が緩すぎる。**何も該当しない方が普通である**。",
    "- 質問文を80字以内に収められない、または上記の概念飛躍禁止に違反せざるを得ない場合は、それも『強い接続が見出せない』証拠なので棄権せよ。",
    "",
    "- 出力は次の JSON 形式のみ（前置きや解説、コードブロック、改行禁止）:",
    `  {"question":"<一行 or 空文字>","sourcePath":"<候補のpath or 空文字>","reason":"${LENS_REASON[lens]}","evidence":"<候補本文からの短い引用 or 空文字>"}`,
    `- ${langLine}`,
  ].join("\n");

  const candidateBlock = candidates
    .map((c) => {
      const body = c.excerpt.slice(0, EXCERPT_CHARS_PER_CANDIDATE).trim();
      return `---\npath: ${c.path}\n\n${body}`;
    })
    .join("\n\n");

  const user = [
    "【現在書いているテキスト（末尾）】",
    currentText,
    "",
    "【過去ノート候補】",
    candidateBlock,
    "---",
    "",
    `上記の【過去ノート候補】から、レンズ「${lens}」に最も合う一本を選び、その本文から短い引用を evidence に入れて、JSON のみで応答せよ。【現在書いているテキスト】からの引用は禁止。`,
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** マッチ判定用の積極的正規化:
 * - NFKC（全角/半角の統一）
 * - lowercase
 * - 各種括弧・引用符・句読点・記号を全部削除
 * - 空白も削除
 * これにより「相手の顔が見えない、デジタル庁…」と「相手の顔が見えないデジタル庁…」が一致する */
function normalizeForFuzzyMatch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[「」『』【】［］\[\]（）()｛｝{}<>《》〈〉""''‘’“”`]/g, "")
    .replace(/[、。，．！？!?,.;；:：・…\/／\-―ー~〜=＝\s　]/g, "");
}

/** 引用が候補本文に実際に含まれるかを正規化込みで判定。空の evidence は trivially valid */
export function evidenceMatchesExcerpt(excerpt: string, evidence: string): boolean {
  if (!evidence) return true;
  const e = normalizeForFuzzyMatch(evidence);
  if (e.length < 4) return false; // あまりに短い引用は trivially match するので拒否
  return normalizeForFuzzyMatch(excerpt).includes(e);
}

/** モデルが返した sourcePath から markdown link / 装飾を剥がす */
export function cleanSourcePath(raw: string): string {
  let s = raw.trim();
  // [text](url) → text
  const md = s.match(/^\[([^\]]+)\]\([^)]*\)\s*$/);
  if (md) s = md[1];
  // [text] → text
  const br = s.match(/^\[([^\]]+)\]\s*$/);
  if (br) s = br[1];
  return s.trim();
}

/** 候補リストから、モデルの返した path 文字列に対応するものを探す。
 * 1) 装飾を剥がした完全一致
 * 2) NFKC + lowercase 正規化での完全一致
 * 3) 同じ basename での一致（folder prefix 違いを吸収）
 * いずれもダメなら null。
 */
export function resolveCandidatePath<T extends { path: string }>(
  candidates: readonly T[],
  rawPath: string,
): T | null {
  const cleaned = cleanSourcePath(rawPath);
  if (!cleaned) return null;
  // 1) Exact
  const exact = candidates.find((c) => c.path === cleaned);
  if (exact) return exact;
  // 2) NFKC normalized full path
  const norm = (s: string) => s.normalize("NFKC").toLowerCase();
  const normCleaned = norm(cleaned);
  const normExact = candidates.find((c) => norm(c.path) === normCleaned);
  if (normExact) return normExact;
  // 3) Basename
  const baseCleaned = norm(cleaned.split("/").pop() || cleaned);
  const baseMatch = candidates.find((c) => {
    const b = c.path.split("/").pop() || c.path;
    return norm(b) === baseCleaned;
  });
  return baseMatch ?? null;
}

const REASON_SET: ReadonlySet<SuggestionReason> = new Set([
  "contradiction",
  "isomorphism",
  "pattern",
  "unknown",
]);

export function parseSuggestion(raw: string): Suggestion | null {
  if (!raw) return null;

  const stripped = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const dejson = stripped
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const start = dejson.indexOf("{");
  const end = dejson.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const jsonStr = dejson.slice(start, end + 1);

  try {
    const obj = JSON.parse(jsonStr) as {
      question?: unknown;
      sourcePath?: unknown;
      reason?: unknown;
      evidence?: unknown;
    };
    if (typeof obj.question !== "string") return null;
    const sourcePath = typeof obj.sourcePath === "string" ? obj.sourcePath : "";
    const reasonRaw = typeof obj.reason === "string" ? obj.reason.toLowerCase() : "unknown";
    const reason: SuggestionReason = (REASON_SET.has(reasonRaw as SuggestionReason)
      ? reasonRaw
      : "unknown") as SuggestionReason;
    const evidence = typeof obj.evidence === "string" ? obj.evidence.trim() : "";
    return {
      question: obj.question.trim(),
      sourcePath,
      reason,
      evidence,
    };
  } catch {
    return null;
  }
}
