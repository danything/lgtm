import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) => {
	const { filename } = params;
	if (filename.includes("/") || filename.includes("..")) {
		return new Response("Not found", { status: 404 });
	}
	const file = Bun.file(`images/${filename}`);
	if (!(await file.exists())) {
		return new Response("Not found", { status: 404 });
	}
	// Every upload gets a fresh uuid filename and is never rewritten, so this
	// URL's bytes cannot change. Saying so keeps browsers and the CDN from
	// revalidating; without it Cloudflare fell back to its own four hour
	// default, and reopening the gallery refetched images it already had.
	return new Response(file, {
		headers: { "cache-control": "public, max-age=31536000, immutable" },
	});
};
