// LGTM signs in with GitHub: the images end up in pull requests, and nothing
// here needs anything from x.com. Only the identity is kept -- the access token
// is used once, to ask who just signed in, and then thrown away.
const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";

export function authorizeUrl(redirectUri: string, state: string): string {
	const params = new URLSearchParams({
		client_id: process.env.GITHUB_CLIENT_ID ?? "",
		redirect_uri: redirectUri,
		// Public profile only. Nothing here reads code, issues or anything else.
		scope: "read:user",
		state,
	});
	return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function accessToken(
	code: string,
	redirectUri: string,
): Promise<string | undefined> {
	const res = await fetch(TOKEN_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			// Without this GitHub answers in form-urlencoded.
			Accept: "application/json",
		},
		body: JSON.stringify({
			client_id: process.env.GITHUB_CLIENT_ID,
			client_secret: process.env.GITHUB_CLIENT_SECRET,
			code,
			redirect_uri: redirectUri,
		}),
		signal: AbortSignal.timeout(15000),
	});
	if (!res.ok) return undefined;
	const body = await res.json();
	return typeof body?.access_token === "string" ? body.access_token : undefined;
}

export async function githubUser(
	token: string,
): Promise<{ id: string; login: string } | undefined> {
	const res = await fetch(USER_URL, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github+json",
			// GitHub rejects API requests that do not name themselves.
			"User-Agent": "lgtm-doany-io",
		},
		signal: AbortSignal.timeout(15000),
	});
	if (!res.ok) return undefined;
	const body = await res.json();
	if (typeof body?.id !== "number" || typeof body?.login !== "string") {
		return undefined;
	}
	return { id: String(body.id), login: body.login };
}
