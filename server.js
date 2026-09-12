import { createReadStream, statSync } from "node:fs";
import http from "node:http";
import { extname, join, normalize } from "node:path";
import { handler } from "./handler.js";

// A rollout runs two pods at once and every build renames its chunks, so a page
// served by one pod can ask the other for JavaScript it has never heard of. The
// asset directory is a volume shared between them to fix that -- but SvelteKit
// answers anything unmatched under /_app with a 404 before hooks run, and the
// static handler it would otherwise use builds its file list once at startup,
// so the older pod never sees a file the newer one dropped in after it booted.
//
// Hence this entry point instead of the adapter's: anything under the immutable
// prefix is looked up on disk on every request, and only a miss goes on to
// SvelteKit. Filenames are content hashes, so the cache header can be forever.
// (This used to be sirv with `dev: true`; the lookup-per-request is the only
// thing it was doing here, and precompression is off in the adapter, so the
// brotli/gzip options it was given had nothing to serve.)
const PREFIX = "/_app/immutable";
const ROOT = `build/client${PREFIX}`;
const TYPES = {
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json",
	".map": "application/json",
	".woff2": "font/woff2",
	".woff": "font/woff",
	".ttf": "font/ttf",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".avif": "image/avif",
	".wasm": "application/wasm",
	".txt": "text/plain; charset=utf-8",
};

/** True if the request was answered from the shared asset directory. */
function serveImmutable(req, res) {
	const url = req.url ?? "";
	if (!url.startsWith(`${PREFIX}/`)) return false;
	if (req.method !== "GET" && req.method !== "HEAD") return false;
	let rel;
	try {
		rel = normalize(decodeURIComponent(url.slice(PREFIX.length).split("?")[0]));
	} catch {
		return false;
	}
	// normalize resolves "a/../b" but leaves a leading "..": never above ROOT.
	if (rel.split("/").includes("..")) return false;
	const file = join(ROOT, rel);
	let stat;
	try {
		stat = statSync(file);
	} catch {
		return false;
	}
	if (!stat.isFile()) return false;
	res.writeHead(200, {
		"content-type": TYPES[extname(file)] ?? "application/octet-stream",
		"content-length": stat.size,
		"cache-control": "public,max-age=31536000,immutable",
	});
	if (req.method === "HEAD") {
		res.end();
		return true;
	}
	// The stat above and the read below are two moments, and the pruning in the
	// entrypoint can remove a file between them. pipe() does not forward the
	// source's error, and an unhandled one takes the whole process down -- the
	// headers are already out, so all that is left is to drop the connection.
	createReadStream(file)
		.on("error", () => res.destroy())
		.pipe(res);
	return true;
}

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const shutdownTimeout = Number(process.env.SHUTDOWN_TIMEOUT ?? 30);

const server = http.createServer((req, res) => {
	if (!serveImmutable(req, res)) handler(req, res);
});

// Repeated from the adapter's index.js rather than inherited: a custom server
// gets handler.js, which reads only ORIGIN, PROTOCOL_HEADER, HOST_HEADER,
// PORT_HEADER, ADDRESS_HEADER, XFF_DEPTH and BODY_SIZE_LIMIT. SHUTDOWN_TIMEOUT
// belongs to the entry point, so honouring it is now this file's job. The pod
// keeps answering what is already in flight while the Cilium Gateway stops
// sending it anything new.
let shuttingDown = false;
function shutdown() {
	if (shuttingDown) return;
	shuttingDown = true;
	server.closeIdleConnections();
	server.close();
	setTimeout(
		() => server.closeAllConnections(),
		shutdownTimeout * 1000,
	).unref();
}
server.on("request", (req) => {
	req.on("close", () => {
		// A keep-alive connection that falls idle after close() started would
		// otherwise sit there until the timeout above gives up on it.
		if (shuttingDown) server.closeIdleConnections();
	});
});
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.listen({ host, port }, () => {
	console.log(`Listening on http://${host}:${port}`);
});
