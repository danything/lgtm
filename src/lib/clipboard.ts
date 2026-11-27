import { setError, setMessage } from "#lib/stores/toast.svelte.js";

/** A tag rather than Markdown, which cannot set width="100%". */
export function lgtmImgTag(fileName: string): string {
  // Read at call time, when `location` exists.
  return `<img src="${window.location.origin}/images/${fileName}" alt="LGTM" width="100%">`;
}

/** Whether it took; Safari and Firefox refuse writes long after a click. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
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
