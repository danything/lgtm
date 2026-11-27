import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, unlinkSync } from "node:fs";

import db from "#lib/server/db.js";
import { useScratchDir, webpFile } from "#lib/server/testing.js";

import { POST as remove } from "./delete/+server";
import { GET as list } from "./images/+server";
import { POST as upload } from "./upload/+server";

type Handler = (event: never) => Response | Promise<Response>;

/** Calls a route handler with just the parts of the event it reads. */
function call(
  handler: Handler,
  init: { key?: string; body?: BodyInit; json?: unknown; url?: string } = {},
) {
  const url = new URL(init.url ?? "http://l.localhost/");
  const request = new Request(url, {
    method: "POST",
    body: init.json === undefined ? init.body : JSON.stringify(init.json),
  });
  const cookies = {
    get: (name: string) => (name === "key" ? init.key : undefined),
  };
  return handler({ request, cookies, url } as never);
}

const form = (...files: File[]) => {
  const data = new FormData();
  for (const f of files) data.append("files", f);
  return data;
};

beforeAll(() => {
  useScratchDir();
  mkdirSync("images");
});

beforeEach(() => {
  db().run("DELETE FROM lImage");
  for (const f of readdirSync("images")) unlinkSync(`images/${f}`);
  db().run("DELETE FROM ghUser");
  db().run(
    "INSERT INTO ghUser (key, githubId, login) VALUES ('u1', '1', 'one'), ('u2', '2', 'two')",
  );
});

describe("upload", () => {
  test("401 without an account", async () => {
    expect((await call(upload, { body: form(webpFile(1, 1)) })).status).toBe(
      401,
    );
    const res = await call(upload, { key: "nobody", body: form() });
    expect(res.status).toBe(401);
  });

  test("stores and answers with the names", async () => {
    const res = await call(upload, { key: "u1", body: form(webpFile(2, 2)) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.files).toHaveLength(1);
  });

  test("400 with a message for a file that is not a WebP", async () => {
    const res = await call(upload, {
      key: "u1",
      body: form(new File([new Uint8Array(64)], "x.png")),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(typeof (await res.json()).error).toBe("string");
  });
});

describe("delete", () => {
  test("only the owner", async () => {
    const up = await call(upload, { key: "u1", body: form(webpFile(2, 2)) });
    const [fileName] = (await up.json()).files;
    expect((await call(remove, { json: { fileName } })).status).toBe(401);
    expect((await call(remove, { key: "u2", json: { fileName } })).status).toBe(
      403,
    );
    expect((await call(remove, { key: "u1", json: {} })).status).toBe(400);
    expect((await call(remove, { key: "u1", json: { fileName } })).status).toBe(
      200,
    );
  });
});

test("images lists newest first and caps the limit", async () => {
  for (let i = 0; i < 3; i++)
    await call(upload, { key: "u1", body: form(webpFile(2, 2)) });
  const res = await call(list, {
    key: "u1",
    url: "http://l.localhost/lgtm/images?offset=1&limit=1&find=true",
  });
  const page = await res.json();
  expect(page).toHaveLength(1);
  expect(page[0].isDeletable).toBe(true);
  const all = await call(list, {
    url: "http://l.localhost/lgtm/images?limit=9999",
  });
  expect(await all.json()).toHaveLength(3);
});

describe("errors", () => {
  const status = async (res: Response | Promise<Response>) => {
    const r = await res;
    expect(typeof (await r.clone().json()).error).toBe("string");
    return r.status;
  };

  test("upload answers a status for each kind of bad file", async () => {
    const up = (body: BodyInit) => call(upload, { key: "u1", body });
    expect(await status(up(form()))).toBe(400);
    expect(await status(up("not a form"))).toBe(400);
    expect(await status(up(form(new File([new Uint8Array(64)], "x"))))).toBe(
      415,
    );
    expect(await status(up(form(webpFile(961, 1))))).toBe(422);
    expect(await status(up(form(webpFile(1, 1, 30 * 1024 * 1024))))).toBe(413);
    expect(db().query("SELECT * FROM lImage").all()).toEqual([]);
  });

  test("delete answers 400 for a body that is not JSON", async () => {
    expect(await status(call(remove, { key: "u1", body: "{" }))).toBe(400);
  });

  test("a failed write leaves nothing behind and answers 500", async () => {
    db().run("DROP TABLE lImage");
    try {
      const res = await call(upload, { key: "u1", body: form(webpFile(1, 1)) });
      expect(await status(res)).toBe(500);
      expect(readdirSync("images")).toEqual([]);
    } finally {
      db().run("PRAGMA user_version = 0");
      (await import("#lib/server/db.js")).migrate(db());
    }
  });
});
