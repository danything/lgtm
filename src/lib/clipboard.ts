import { setMessage } from "$lib/stores/toast.svelte";

/** Markdown for one uploaded image, ready to paste into a review. */
export function lgtmMarkdown(fileName: string): string {
	// Read at call time, when `location` exists.
	return `![LGTM](${window.location.origin}/images/${fileName})`;
}

/**
 * Whether the clipboard took it. Browsers want a recent user gesture for this,
 * and an upload finishing is not one -- Safari and Firefox can refuse a write
 * that happens after the await. Callers say something different when they do.
 */
export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

/** Copy, and say which of the two things happened. */
export async function copyAndReport(
	text: string,
	copied: string,
	failed: string,
) {
	setMessage((await copyText(text)) ? copied : failed);
}
