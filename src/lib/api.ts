import { MAX_REQUEST_BYTES, mb } from "#lib/limits.js";

/** A request that failed, with a message to show as is. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function messageOf(res: Response): Promise<string> {
  // 413 comes from SvelteKit's body limit, before any route can answer.
  if (res.status === 413)
    return `一度に送れるのは ${mb(MAX_REQUEST_BYTES)} までです。枚数を減らしてください`;
  try {
    const body = await res.json();
    const message = body?.error ?? body?.message;
    if (typeof message === "string" && message !== "") return message;
  } catch {
    // Not JSON: a proxy's error page, say.
  }
  return `サーバーでエラーが起きました (${res.status})`;
}

/** fetch, then the JSON body; any failure becomes an ApiError. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, "通信できませんでした。接続を確かめてください");
  }
  if (!res.ok) throw new ApiError(res.status, await messageOf(res));
  return res.json();
}

export const postJson = <T>(url: string, body: unknown, method = "POST") =>
  api<T>(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
