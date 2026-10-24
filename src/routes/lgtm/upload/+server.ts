import { json } from "@sveltejs/kit";
import { accountExists } from "#lib/server/account.js";
import { create, InvalidImageError } from "#lib/server/lgtm.js";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, cookies }) => {
	const userKey = cookies.get("key");
	if (!userKey || !accountExists(userKey)) {
		return json({ error: "ログインしてください" }, { status: 401 });
	}
	const formData = await request.formData();
	const files = formData
		.getAll("files")
		.filter((f): f is File => f instanceof File);
	try {
		const created = await create(files, userKey);
		return json({ ok: true, files: created });
	} catch (e) {
		// The browser makes these files, so a bad one means a broken or
		// hand-made upload rather than a picture we failed to understand.
		if (e instanceof InvalidImageError) {
			return json({ error: "画像の形式が正しくありません" }, { status: 400 });
		}
		throw e;
	}
};
