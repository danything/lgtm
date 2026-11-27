import { afterEach, expect, test } from "bun:test";

import { api, ApiError } from "./api";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const answer = (res: Response | Error) => {
  globalThis.fetch = (async () => {
    if (res instanceof Error) throw res;
    return res;
  }) as unknown as typeof fetch;
};

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error("did not fail");
};

test("answers the JSON body", async () => {
  answer(Response.json({ ok: true }));
  expect(await api("/x")).toEqual({ ok: true });
});

test("shows the server's own message", async () => {
  answer(Response.json({ error: "ログインしてください" }, { status: 401 }));
  const e = await failure(api("/x"));
  expect(e).toBeInstanceOf(ApiError);
  expect([e.status, e.message]).toEqual([401, "ログインしてください"]);
});

test("says something useful without one", async () => {
  answer(new Response("<html>bad gateway</html>", { status: 502 }));
  expect((await failure(api("/x"))).message).toContain("502");
  answer(new Response("too big", { status: 413 }));
  expect((await failure(api("/x"))).message).toContain("100MB");
  answer(new TypeError("Failed to fetch"));
  expect((await failure(api("/x"))).status).toBe(0);
});
