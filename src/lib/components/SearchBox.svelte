<script lang="ts">
  import { page } from "$app/state";

  import { MAX_QUERY } from "#lib/search.js";

  // The box shows what the top page is showing results for.
  const query = $derived(
    page.url.pathname === "/" ? (page.url.searchParams.get("q") ?? "") : "",
  );

  // Narrow screens have no room for the box beside the rest of the header: a
  // button opens it over the header instead.
  let open = $state(false);
  let input = $state<HTMLInputElement>();

  function show() {
    open = true;
    // After the box is shown, so the phone's keyboard comes up.
    queueMicrotask(() => input?.focus());
  }

  // Closed again once the results are showing.
  $effect(() => {
    void page.url;
    open = false;
  });
</script>

<button
  type="button"
  class="icon toggle"
  aria-label="画像を言葉で探す"
  aria-expanded={open}
  onclick={show}
>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 5 5" />
  </svg>
</button>
<!-- 画像に付いた言葉で探す。トップの一覧で結果を見せる -->
<form class="search" class:open role="search" action="/" method="get">
  {#key query}
    <input
      bind:this={input}
      type="search"
      name="q"
      value={query}
      maxlength={MAX_QUERY}
      placeholder="猫・ラーメン・ピース"
      aria-label="画像を言葉で探す"
      enterkeyhint="search"
      autocomplete="off"
      onkeydown={(e) => {
        if (e.key === "Escape") open = false;
      }}
    />
  {/key}
  <button
    type="button"
    class="icon close"
    aria-label="閉じる"
    onclick={() => (open = false)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  </button>
</form>

<style>
  svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-width: 2;
  }
  /*
   * 欄の大きさ。広い画面ではほかの部品の間に置き、18rem まで。
   * 高さはほかの部品と同じ 2.5rem
   */
  .search {
    display: flex;
    flex: 0 1 18rem;
    align-items: center;
    gap: 0.25rem;
    min-width: 8rem;
    margin: 0;
  }
  /* フォルダの名前の欄と同じ線と地。丸はヘッダーのタブにそろえる */
  input {
    width: 100%;
    height: 2.5rem;
    margin: 0;
    border: 1px solid var(--ui-line);
    border-radius: var(--ui-radius-full);
    background: var(--ui-bg);
    box-shadow: none;
    padding-block: 0;
    padding-inline: 1rem;
    color: var(--ui-fg);
    font-size: var(--ui-text-sm);
  }
  input:focus-visible {
    outline: 2px solid var(--pico-primary);
    outline-offset: 1px;
  }
  .close {
    display: none;
  }
  /*
   * 狭い画面では虫めがねのボタンだけ。押すとヘッダーの上に欄が重なって開く
   * (動きは透明度と位置だけ)
   */
  @media (max-width: 639.98px) {
    .search {
      position: absolute;
      z-index: 1;
      inset: 0;
      border-radius: inherit;
      /* 下のロゴやボタンが透けないよう、地は塗りきる */
      background: var(--ui-bg);
      padding: 0.375rem;
      opacity: 0;
      pointer-events: none;
      transform: translateY(-0.25rem);
      transition:
        opacity var(--ui-duration) var(--ui-ease),
        transform var(--ui-duration) var(--ui-ease-out);
    }
    .search.open {
      opacity: 1;
      pointer-events: auto;
      transform: none;
    }
    .close {
      display: inline-flex;
      flex: 0 0 auto;
    }
  }
  @media (min-width: 640px) {
    .toggle {
      display: none;
    }
  }
</style>
