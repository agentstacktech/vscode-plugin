/** Shared HTTP fetch with timeout and optional external AbortSignal. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  const onAbort = () => ac.abort();
  externalSignal?.addEventListener("abort", onAbort);
  try {
    return await fetch(url, {
      ...init,
      signal: ac.signal,
    });
  } finally {
    clearTimeout(t);
    externalSignal?.removeEventListener("abort", onAbort);
  }
}

export function readTraceId(res: Response): string | undefined {
  return res.headers.get("X-Trace-Id") ?? res.headers.get("x-trace-id") ?? undefined;
}
