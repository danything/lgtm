<script lang="ts">
  import { browser } from "$app/env";
  import { afterNavigate, beforeNavigate } from "$app/navigation";
  import { page, updated } from "$app/state";

  import SearchBox from "#lib/components/SearchBox.svelte";
  import SignInButton from "#lib/components/SignInButton.svelte";
  import ThemeToggle from "#lib/components/ThemeToggle.svelte";
  import Toast from "#lib/components/Toast.svelte";
  import Upload from "#lib/components/Upload.svelte";
  import "../app.css";

  let { children, data } = $props();

  // After a rollout the old hashed chunks are gone; hand navigation to the
  // browser so it loads the live version.
  let staleAssets = false;
  let pending: string | undefined;

  beforeNavigate(({ willUnload, to }) => {
    if (willUnload || !to?.url) return;
    pending = to.url.href;
    // Set by the version poll in vite.config.ts.
    if (staleAssets || updated.current) location.href = to.url.href;
  });

  afterNavigate(() => {
    pending = undefined;
  });

  if (browser) {
    // A chunk 404ed. Hovering preloads too, so only reload mid-navigation.
    addEventListener("vite:preloadError", (event) => {
      event.preventDefault();
      staleAssets = true;
      if (pending) location.href = pending;
    });
  }
</script>

<!-- サイト共通の分だけ。タイトルと説明文はページごとに書く -->
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
  <!-- タブはリンク。「自分」をリンクでき、再読み込みでも戻されない -->
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
    <Upload />
  {/if}
  <!-- ドロップは何も言わないと気づかれない。ログインしていないと受け皿が無いので文を変える -->
  <span class="muted small hint">
    {#if data.ghLogin}
      Tenor等の画像は、このページに直接ドラッグ&amp;ドロップでも追加できます
    {:else}
      GitHubでログインすると、Tenor等の画像を直接ドラッグ&amp;ドロップで登録できます
    {/if}
  </span>
  <div class="grow"></div>
  <SearchBox />
  <ThemeToggle initial={data.theme} />
  <!-- 管理は名前より左 (右端だと人によって名前の位置が変わる) -->
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
  /* ヘッダーは操作の層。部品は 2.5rem にそろえ、帯は余白込みで 3.25rem */
  :global(:root) {
    --ui-header-top: 0.25rem;
    --ui-header-bottom: calc(var(--ui-header-top) + 3.25rem);
    /* 浮いた面の形。トップの絞り込みの帯 (GroupBar) も同じ面にする */
    --ui-header-inset: 0.5rem;
    --ui-header-radius: 0.875rem;
  }
  @media (min-width: 640px) {
    :global(:root) {
      --ui-header-inset: 0.75rem;
    }
  }
  nav {
    position: fixed;
    z-index: 40;
    top: var(--ui-header-top);
    inset-inline: var(--ui-header-inset);
    min-height: 3.25rem;
    border-radius: var(--ui-header-radius);
    background: var(--ui-float);
    box-shadow: var(--ui-shadow-pop);
    padding: 0.375rem;
    flex-wrap: nowrap;
    gap: 0.25rem;
    /* 開いたときに上からすっと降りてくる (一度だけ。ページを移っても帯はそのまま) */
    animation: ui-drop 420ms var(--ui-ease-out) both;
    /* テーマを切り替えたとき、面と影もふわっと移る */
    transition:
      background-color 240ms var(--ui-ease),
      box-shadow 240ms var(--ui-ease);
  }
  /*
   * 一番上では平ら、巻き始めの 3rem で面と影が付く (scroll-driven animation)。
   * 使えないブラウザと動きを減らす設定では、いつも浮かせる
   */
  @supports (animation-timeline: scroll()) {
    @media (prefers-reduced-motion: no-preference) {
      nav {
        background-color: transparent;
        box-shadow: none;
        animation:
          ui-drop 420ms var(--ui-ease-out) both,
          ui-lift linear both;
        animation-timeline: auto, scroll(root);
        animation-range:
          normal,
          0 3rem;
      }
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

  /* いまいる場所は下線と主の色の太字。行は塗らない */
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
    /* 選んだタブに移ると、線が真ん中から伸びる */
    animation: ui-grow 260ms var(--ui-ease-out) both;
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
