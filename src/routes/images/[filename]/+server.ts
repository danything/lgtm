import { imagePath } from "#lib/server/storage.js";

import type { RequestHandler } from "./$types";

const notFound = () => new Response("Not found", { status: 404 });

export const GET: RequestHandler = async ({ params: { filename } }) => {
  if (filename.includes("/") || filename.includes("..")) return notFound();
  const file = Bun.file(imagePath(filename));
  if (!(await file.exists())) return notFound();
  // Names are fresh uuids and never rewritten; without this Cloudflare
  // revalidated every four hours.
  return new Response(file, {
    headers: { "cache-control": "public, max-age=31536000, immutable" },
  });
};
