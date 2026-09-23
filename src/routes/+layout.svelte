<script lang="ts">
import { browser } from "$app/environment";
import { afterNavigate, beforeNavigate } from "$app/navigation";
import { page, updated } from "$app/state";
import SignInButton from "$lib/components/SignInButton.svelte";
import Toast from "$lib/components/Toast.svelte";
import Upload from "$lib/components/Upload.svelte";
import "../app.scss";

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

<!-- サイト共通の分だけ。タイトルと説明文はページごとに書く: 同じものを全ページに
     出すと検索結果で見分けが付かず、ログインが要るページまで拾われる。 -->
<svelte:head>
	<meta property="og:site_name" content="LGTM" />
	<meta property="og:type" content="website" />
	<meta property="og:locale" content="ja_JP" />
	<meta property="og:image" content={`${page.url.origin}/og.png`} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="LGTM - Looks Good To Me" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<nav class="cluster">
	<a class="button ghost logo" href="/">LGTM</a>
	<!-- ラジオボタンとパネルを組にした作りではなくリンクにしてある: あれはラベルと
	     パネルが同じ親にいる間しか動かないが、ここへ持ち上げた時点で同じ親ではない。
	     そもそもルートにするほうが筋が良い -- 「自分」がリンクできる場所になり、
	     再読み込みで 新着 に戻されることもなくなる。 -->
	<div role="tablist" class="tabs">
		<a role="tab" class="tab" class:on={page.url.pathname === "/"} href="/"
			>新着</a
		>
		{#if data.ghLogin}
			<a
				role="tab"
				class="tab"
				class:on={page.url.pathname === "/mine"}
				href="/mine">自分</a
			>
		{/if}
	</div>
	{#if data.ghLogin}
		<!-- The one thing this site is for, one click from anywhere in it. -->
		<Upload />
	{/if}
	<!-- Dropping a file is the good way in and the one nothing announces, so it
	     is said here, in the space the toolbar was not using. Desktop only, and
	     not as a compromise: dragging out of Tenor is not a thing a phone can
	     do, so there is nobody being kept from it.

	     Signed out it has to say something else. The drop handler lives inside
	     Upload, which is not on the page at all then, so a file let go over it
	     would simply do nothing -- and an invitation that quietly fails is
	     worse than no invitation. -->
	<span class="muted small hint">
		{#if data.ghLogin}
			Tenor等の画像は、このページに直接ドラッグ&amp;ドロップでも追加できます
		{:else}
			GitHubでログインすると、Tenor等の画像を直接ドラッグ&amp;ドロップで登録できます
		{/if}
	</span>
	<div class="grow"></div>
	{#if data.ghLogin}
		<span class="muted small who">{data.ghLogin}</span>
	{:else}
		<SignInButton />
	{/if}
	{#if data.isAdmin}
		<a class="button ghost mini" href="/admin">管理</a>
	{/if}
</nav>
<main>
	{@render children()}
</main>
<Toast />

<style>
/* 高さはタブ(2.5rem)に合わせる。ロゴがボタンの既定の上下余白で 52px になり、
   ヘッダーが見た目より 1 段高くなって下に余白が空いて見えていた */
nav {
	min-height: 3rem;
	padding: 0.25rem 1rem;
}
.logo {
	padding-block: 0;
	padding-inline: 0.5rem;
	font-size: 1.25rem;
}

/* 下線で現在地を示すタブ */
.tabs {
	display: flex;
	align-items: center;
}
.tab {
	display: inline-flex;
	align-items: center;
	height: 2.5rem;
	border-bottom: 2px solid transparent;
	padding-inline: 1rem;
	color: var(--ui-muted);
	font-size: 0.875rem;
	font-weight: 700;
	text-decoration: none;
}
.tab:hover {
	color: var(--pico-color);
}
.tab.on {
	border-bottom-color: currentColor;
	color: var(--pico-color);
}

/* ドラッグ&ドロップの案内は横幅に余裕のある画面だけ */
.hint {
	display: none;
}
@media (min-width: 1024px) {
	.hint {
		display: inline;
	}
}
.who {
	display: none;
}
@media (min-width: 640px) {
	.who {
		display: inline;
	}
}
</style>
