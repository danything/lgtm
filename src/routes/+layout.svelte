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
  <a class="button ghost logo" href="/">
    <!-- いちばん狭い画面では字の代わりに favicon と同じ印 -->
    <svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#10b981" />
      <path
        d="M8.5 16.5 13.5 21.5 23.5 10.5"
        fill="none"
        stroke="#fff"
        stroke-width="4.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    <span class="word">LGTM</span>
  </a>
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
    <a class="button ghost admin" href="/admin">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z"
        />
      </svg>
      <span class="label">管理</span>
    </a>
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
  /*
   * 部品は縮めない (縮むとアイコンが潰れ、ログインが右へはみ出す)。
   * 縮むのは案内・すき間・検索欄・名前だけ
   */
  nav > :global(*) {
    flex-shrink: 0;
  }
  /*
   * 押せる高さは 44px。見た目は 2.5rem のまま、帯の余白へ上下 2px ずつ広げる
   * (タブの ::after は下線なので、広げるのは ::before)
   */
  nav :global(:is(a, button)) {
    position: relative;
  }
  nav :global(:is(a, button))::before {
    position: absolute;
    inset: -2px 0;
    content: "";
  }
  /* ボタンは枠線の内側が基準なので、その分も外へ */
  nav :global(:is(a.button, button))::before {
    inset-block: calc(-2px - var(--pico-border-width));
  }
  nav a.button.logo {
    padding-inline: 0.75rem;
    font-size: 1.125rem;
    letter-spacing: 0.02em;
  }
  .mark,
  .admin svg {
    display: none;
  }
  .mark {
    width: 1.5rem;
    height: 1.5rem;
  }
  .admin svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-linejoin: round;
    stroke-width: 2;
  }

  /*
   * 狭い画面 (ログインと画像を追加が字を畳むのと同じ 560px 未満)。
   * 管理は盾の印の円、ロゴとタブの左右とすき間を詰める
   */
  @media (max-width: 559.98px) {
    nav {
      gap: 0.125rem;
    }
    nav a.button.logo {
      padding-inline: 0.5rem;
    }
    .tabs .tab {
      padding-inline: 0.625rem;
    }
    .tabs .tab.on::after {
      inset-inline: 0.625rem;
    }
    .admin {
      width: var(--ui-btn-h);
      padding: 0;
    }
    .admin svg {
      display: block;
    }
    /* 字は見せずに読み上げに残す */
    .admin .label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  /* 375px 未満はすき間を無くし、タブをもう一段詰める */
  @media (max-width: 374.98px) {
    nav {
      gap: 0;
    }
    .tabs .tab {
      padding-inline: 0.5rem;
    }
    .tabs .tab.on::after {
      inset-inline: 0.5rem;
    }
  }
  /* 360px 未満はロゴを印にする (管理まで並ぶと字のロゴでは収まらない) */
  @media (max-width: 359.98px) {
    nav a.button.logo {
      width: var(--ui-btn-h);
      padding: 0;
    }
    .mark {
      display: block;
    }
    .word {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
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
    flex-shrink: 1;
    min-width: 0;
    padding-inline: 0.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (min-width: 1024px) {
    .hint {
      display: inline;
    }
    /* 案内が縮むので、名前は割り振りで端数だけ削られないよう縮めない */
    nav .who {
      flex-shrink: 0;
    }
  }
  /* 長い名前は省略して 1 行に。部品を押し出さない */
  .who {
    display: none;
    flex-shrink: 1;
    min-width: 0;
    max-width: 12rem;
    overflow: hidden;
    padding-inline: 0.5rem 0.625rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (min-width: 640px) {
    nav .who {
      display: inline;
    }
  }
</style>
