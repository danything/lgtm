<script lang="ts">
import SignInButton from "#lib/components/SignInButton.svelte";
import Toast from "#lib/components/Toast.svelte";
import Upload from "#lib/components/Upload.svelte";
import { browser } from "$app/env";
import { afterNavigate, beforeNavigate } from "$app/navigation";
import { page, updated } from "$app/state";
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
	<!-- 管理は名前より左。右端に置くと、管理者かどうかで名前の位置が変わり、
	     同じ画面なのに人によって並びが違って見える。 -->
	{#if data.isAdmin}
		<a class="button ghost" href="/admin">管理</a>
	{/if}
	{#if data.ghLogin}
		<span class="muted small who">{data.ghLogin}</span>
	{:else}
		<SignInButton />
	{/if}
</nav>
<main>
	{@render children()}
</main>
<Toast />

<style>
/*
 * **ヘッダーは操作の層** (denpa の docs/design.md「3 つの層」)。端から離した角の丸い帯を
 * 画像の上に浮かせ、面は `--ui-float` (92% 残した半透明。ぼかさない)。一覧はヘッダーの
 * 裏を流れて透ける。中のボタンは浮かせず太字だけ (浮いたものの上に浮かせない)。
 *
 * 部品は全部 2.5rem の高さにそろえ、帯の中の余白 (0.375rem) と合わせて帯は 3.25rem。
 * 角は入れ子でそろえる: 外 (0.875rem) = 中のボタンの角の半径に近い丸み + 余白
 *
 * `--ui-header-bottom` は帯の下端。中身はここから始め、一覧はさらにタイル同士と同じ
 * 0.75rem を空ける (帯と一覧の間が、タイルの間と同じ幅に見える)
 */
:global(:root) {
	--ui-header-top: 0.5rem;
	--ui-header-bottom: calc(var(--ui-header-top) + 3.25rem);
}
nav {
	position: fixed;
	z-index: 40;
	top: var(--ui-header-top);
	inset-inline: 0.5rem;
	min-height: 3.25rem;
	border-radius: 0.875rem;
	background: var(--ui-float);
	box-shadow: var(--ui-shadow-pop);
	padding: 0.375rem;
	flex-wrap: nowrap;
	gap: 0.25rem;
}
@media (min-width: 640px) {
	nav {
		inset-inline: 0.75rem;
	}
}
main {
	padding-top: var(--ui-header-bottom);
}
nav a.button.logo {
	padding-inline: 0.75rem;
	font-size: 1.125rem;
	letter-spacing: 0.02em;
}

/*
 * いまいる場所は**文字の幅いっぱいの下線と主の色の太字**。行を塗らない。
 * ほかのタブも本文の色のまま (薄くしない)。乗せたときは薄い地だけ
 */
.tabs {
	display: flex;
	align-items: center;
}
.tab {
	position: relative;
	display: inline-flex;
	align-items: center;
	height: 2.5rem;
	border-radius: var(--ui-radius-full);
	padding-inline: 0.875rem;
	color: var(--ui-fg);
	font-size: var(--ui-text-sm);
	text-decoration: none;
	transition: background-color var(--ui-duration) var(--ui-ease);
}
.tab:hover {
	background: var(--ui-hover-soft);
}
.tab.on {
	color: var(--ui-primary-text);
	font-weight: 700;
}
/* 線は押す範囲の内側に引き、高さを変えない */
.tab.on::after {
	position: absolute;
	inset-inline: 0.875rem;
	bottom: 0.3rem;
	height: 2px;
	border-radius: 1px;
	background: var(--pico-primary);
	content: "";
}

/* ドラッグ&ドロップの案内は横幅に余裕のある画面だけ */
.hint {
	display: none;
	padding-inline: 0.5rem;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
@media (min-width: 1024px) {
	.hint {
		display: inline;
	}
}
.who {
	display: none;
	padding-inline: 0.5rem 0.625rem;
}
@media (min-width: 640px) {
	.who {
		display: inline;
	}
}
</style>