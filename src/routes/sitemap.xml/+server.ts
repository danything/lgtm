import type { RequestHandler } from "./$types";

// 検索に出したいページはトップだけ。/mine と /admin はログインが要り、
// robots.txt と noindex で外してある。
export const GET: RequestHandler = ({ url }) =>
	new Response(
		`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
	<url><loc>${url.origin}/</loc></url>
</urlset>
`,
		{ headers: { "content-type": "application/xml; charset=utf-8" } },
	);
