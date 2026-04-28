export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  numCtx: number;
  temperature?: number;
  keepAliveSec?: number;
  thinking?: boolean;
  signal?: AbortSignal;
}

export class OllamaClient {
  constructor(private endpoint: string) {}

  setEndpoint(endpoint: string) {
    this.endpoint = endpoint;
  }

  async embed(input: string, model: string, keepAliveSec = 1800): Promise<number[]> {
    const url = `${this.endpoint.replace(/\/$/, "")}/api/embed`;
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          input,
          keep_alive: `${keepAliveSec}s`,
        }),
      },
      30_000,
    );
    if (!res.ok) {
      throw new Error(`Ollama embed failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { embeddings: number[][] };
    if (!data.embeddings || !data.embeddings[0]) {
      throw new Error("Ollama embed: empty embeddings");
    }
    return data.embeddings[0];
  }

  async chat(
    messages: ChatMessage[],
    model: string,
    opts: ChatOptions,
  ): Promise<string> {
    const url = `${this.endpoint.replace(/\/$/, "")}/api/chat`;
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
      keep_alive: `${opts.keepAliveSec ?? 1800}s`,
      options: {
        num_ctx: opts.numCtx,
        temperature: opts.temperature ?? 0.7,
      },
    };
    if (opts.thinking !== undefined) {
      body.think = opts.thinking;
    }
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      300_000, // 5分 — cold model load + 長プロンプト時に 120s だと足りない
      opts.signal,
    );
    if (!res.ok) {
      throw new Error(`Ollama chat failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { message: { content: string } };
    return data.message?.content ?? "";
  }

  async ping(): Promise<boolean> {
    try {
      const url = `${this.endpoint.replace(/\/$/, "")}/api/tags`;
      const res = await fetchWithTimeout(url, { method: "GET" }, 5_000);
      return res.ok;
    } catch {
      return false;
    }
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  const onExtAbort = () => ac.abort();
  if (externalSignal) {
    if (externalSignal.aborted) ac.abort();
    else externalSignal.addEventListener("abort", onExtAbort, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
    if (externalSignal) externalSignal.removeEventListener("abort", onExtAbort);
  }
}
