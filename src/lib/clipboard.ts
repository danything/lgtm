import { setError, setMessage } from "#lib/stores/toast.svelte.js";

/** A tag rather than Markdown, which cannot set width="100%". */
export function lgtmImgTag(fileName: string): string {
  // Read at call time, when `location` exists.
  return `<img src="${window.location.origin}/images/${fileName}" alt="LGTM" width="100%">`;
}

// Chrome can leave a write pending without ever settling while its window is
// not in front; unbounded, the upload button stayed on 生成中 for good and the
// new tile never showed up.
const COPY_TIMEOUT_MS = 2000;

/** Whether it took; Safari and Firefox refuse writes long after a click. */
export async function copyText(text: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.clipboard.writeText(text).then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), COPY_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Copy, say which of the two happened, and answer whether it took. */
export async function copyAndReport(
  text: string,
  copied: string,
  failed: string,
): Promise<boolean> {
  const ok = await copyText(text);
  if (ok) setMessage(copied);
  else setError(failed);
  return ok;
}
