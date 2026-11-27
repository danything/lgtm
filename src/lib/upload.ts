import { api, ApiError } from "#lib/api.js";
import {
  ConvertError,
  convertMessage,
  makeLgtm,
  UnsupportedBrowserError,
} from "#lib/lgtm/index.js";

/** Converts in the browser, uploads, and answers with the stored names. */
export async function uploadPictures(
  files: File[],
  onProgress: (fraction: number) => void,
): Promise<string[]> {
  const body = new FormData();
  for (const file of await makeLgtm(files, onProgress))
    body.append("files", file);
  const { files: created } = await api<{ files: string[] }>("/lgtm/upload", {
    method: "POST",
    body,
  });
  return created;
}

export function uploadErrorMessage(e: unknown): string {
  if (e instanceof UnsupportedBrowserError)
    return "このブラウザでは画像を変換できません。最新のブラウザでお試しください";
  if (e instanceof ConvertError) return convertMessage(e);
  if (e instanceof ApiError) return e.message;
  console.error(e);
  return "画像を追加できませんでした";
}
