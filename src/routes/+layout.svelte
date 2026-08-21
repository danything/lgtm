<script lang="ts">
import { browser } from "$app/environment";
import { afterNavigate, beforeNavigate } from "$app/navigation";
import { updated } from "$app/state";
import SignInButton from "$lib/components/SignInButton.svelte";
import Toast from "$lib/components/Toast.svelte";
import Upload from "$lib/components/Upload.svelte";
import "../app.css";

let { children, data } = $props();

// A rolling update replaces the hashed asset filenames, so a tab opened before
// the deploy asks for chunks the new pods no longer have. Without this a click
// on a link just dies; instead we hand the navigation over to the browser,
// which reloads the page against whichever version is live now.
let staleAssets = false;
let pending: string | undefined;

beforeNavigate(({ willUnload, to }) => {
	if (willUnload || !to?.url) return;
	pending = to.url.href;
	// `updated` flips once the version poll configured in vite.config.ts sees a
	// new build.
	if (staleAssets || updated.current) location.href = to.url.href;
});

afterNavigate(() => {
	pending = undefined;
});

if (browser) {
	// Vite fires this when a lazily imported chunk 404s, which happens if the
	// poll has not run yet or the request reached a pod that was already
	// replaced. Hovering a link preloads code too, so only take over when a
	// navigation is actually in flight -- otherwise just remember for the next
	// click rather than reloading the page under the user.
	addEventListener("vite:preloadError", (event) => {
		event.preventDefault();
		staleAssets = true;
		if (pending) location.href = pending;
	});
}
</script>

<svelte:head>
	<title>LGTM</title>
	<meta name="description" content="LGTM画像を生成できます" />
</svelte:head>

<nav class="navbar gap-2 px-4">
	<a class="btn btn-ghost px-2 text-xl" href="/">LGTM</a>
	{#if data.ghLogin}
		<!-- The one thing this site is for, one click from anywhere in it. -->
		<Upload />
	{/if}
	<div class="flex-1"></div>
	{#if data.ghLogin}
		<span class="hidden text-sm opacity-60 sm:inline">{data.ghLogin}</span>
	{:else}
		<SignInButton />
	{/if}
	{#if data.isAdmin}
		<a class="btn btn-ghost btn-sm" href="/admin">管理</a>
	{/if}
</nav>
<main>
	{@render children()}
</main>
<Toast />
