// Sign-in only: the token is used once to ask who arrived, then dropped.
const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";

export function authorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    scope: "read:user",
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function ok(res: Response, what: string): Promise<unknown> {
  if (res.ok) return res.json();
  console.error(`GitHub ${what}: ${res.status}`);
  return undefined;
}

export async function accessToken(
  code: string,
  redirectUri: string,
): Promise<string | undefined> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Otherwise GitHub answers form-urlencoded.
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
  const body = (await ok(res, "token")) as { access_token?: unknown };
  return typeof body?.access_token === "string" ? body.access_token : undefined;
}

export async function githubUser(
  token: string,
): Promise<{ id: string; login: string } | undefined> {
  const res = await fetch(USER_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      // GitHub rejects API requests without one.
      "User-Agent": "lgtm-doany-io",
    },
    signal: AbortSignal.timeout(15000),
  });
  const body = (await ok(res, "user")) as { id?: unknown; login?: unknown };
  if (typeof body?.id !== "number" || typeof body?.login !== "string")
    return undefined;
  return { id: String(body.id), login: body.login };
}
