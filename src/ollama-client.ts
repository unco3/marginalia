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
  /** When provided, request will be streamed and this is called for each chunk.
   * `chunk` is the new piece, `accumulated` is the full text so far. */
  onChunk?: (chunk: string, accumulated: string) => void;
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
    const streaming = !!opts.onChunk;
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: streaming,
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
      300_000, // 5min — cold model load + long prompts can exceed 120s
      opts.signal,
    );
    if (!res.ok) {
      throw new Error(`Ollama chat failed: ${res.status} ${await res.text()}`);
    }
    if (!streaming) {
      const data = (await res.json()) as { message: { content: string } };
      return data.message?.content ?? "";
    }
    // Streaming path: NDJSON, one JSON object per line
    if (!res.body) throw new Error("Ollama chat: no response body for stream");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulated = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (!line) continue;
          try {
            const obj = JSON.parse(line) as {
              message?: { content?: string };
              done?: boolean;
              error?: string;
            };
            if (obj.error) throw new Error(`Ollama stream error: ${obj.error}`);
            const chunk = obj.message?.content;
            if (chunk) {
              accumulated += chunk;
              opts.onChunk?.(chunk, accumulated);
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue; // skip malformed line
            throw e;
          }
        }
      }
    } finally {
      reader.releaseLock?.();
    }
    return accumulated;
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
