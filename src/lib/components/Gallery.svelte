<script lang="ts" module>
  export type File = {
    name: string;
    isDeletable: boolean;
    width: number;
    height: number;
    folderId: number | null;
  };
</script>

<script lang="ts">
  import { type Snippet, untrack } from "svelte";

  import { api } from "#lib/api.js";
  import { copyText, lgtmImgTag } from "#lib/clipboard.js";
  import { type Folder, type FolderFilter, folderParam } from "#lib/folders.js";
  import type { GroupKey } from "#lib/groups.js";
  import { FIRST_LIMIT, PER_PAGE } from "#lib/paging.js";
  import { setError } from "#lib/stores/toast.svelte.js";

  import CopyButton from "./CopyButton.svelte";
  import DeleteButton from "./DeleteButton.svelte";
  import MoveDialog from "./MoveDialog.svelte";
  import PreviewButton from "./PreviewButton.svelte";
  import "@sveti/blades/components/modal";

  let {
    fileNameList,
    userKey,
    find,
    folders,
    folder,
    onMoved,
    empty,
    group,
    strip = false,
  }: {
    fileNameList: File[];
    userKey?: string;
    find: boolean;
    /** Only on the owner's page, where images can be moved between them. */
    folders?: Folder[];
    folder?: FolderFilter;
    onMoved?: (from: number | null, to: number | null) => void;
    /** Shown once nothing is left, including after the last tile moves or goes. */
    empty?: Snippet;
    /** Narrows the top page to one group. */
    group?: GroupKey;
    /** One scrolling row of what it was given, loading no more. */
    strip?: boolean;
  } = $props();

  let moveDialog: MoveDialog | undefined = $state();

  function moved(fileName: string, from: number | null, to: number | null) {
    // Leaves a filtered view it no longer belongs in.
    const stays =
      folder === undefined || (folder === "none" ? to === null : to === folder);
    items = stays
      ? items.map((f) => (f.name === fileName ? { ...f, folderId: to } : f))
      : items.filter((f) => f.name !== fileName);
    onMoved?.(from, to);
  }

  // About the first screen on a desktop; the rest load lazily.
  const EAGER = 6;

  // Seeded once for SSR; the $effect below re-syncs on later prop changes.
  let items = $state<File[]>(untrack(() => fileNameList));
  // Not $state: nothing renders from them, and the effect resets them.
  let isGetting = false;
  // Bumped on reset so a fetch in flight cannot append to the new list.
  let generation = 0;
  let isDone = false;
  let sentinel: HTMLDivElement | undefined = $state();
  let diaImage = $state<File>();
  // The tile just copied, which shows a tick for a moment.
  let copied = $state<string>();
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  // Success shows on the tile; failure has nowhere there, so it toasts.
  async function copyTile(name: string) {
    if (!(await copyText(lgtmImgTag(name)))) {
      setError("コピーできませんでした");
      return;
    }
    copied = name;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied = undefined), 1200);
  }
  let dialog: HTMLDialogElement | undefined = $state();

  function onClickItem(file: File) {
    diaImage = file;
    dialog?.showModal();
  }
  function closeDialog() {
    dialog?.close();
  }

  // An image can finish before hydration, and a broken one never will.
  function markLoaded(img: HTMLImageElement) {
    const done = () => img.classList.add("loaded");
    if (img.complete) {
      done();
      return;
    }
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  }

  function removeItem(fileName: string) {
    items = items.filter((f) => f.name !== fileName);
  }

  async function loadMore(observer: IntersectionObserver) {
    if (isGetting || isDone) return;
    isGetting = true;
    const started = generation;
    let page: File[];
    try {
      page = await api<File[]>(
        `/lgtm/images?offset=${items.length}&limit=${PER_PAGE}&find=${find}&folder=${folderParam(folder)}&group=${group ?? ""}`,
      );
    } catch (e) {
      // Stops here; scrolling back to the end tries again.
      if (started === generation) {
        setError(`続きを読み込めませんでした: ${(e as Error).message}`);
        isGetting = false;
      }
      return;
    }
    if (started !== generation) return;
    // An upload meanwhile shifts rows down, so drop repeats of what we have.
    const have = new Set(items.map((f) => f.name));
    items = [...items, ...page.filter((f) => !have.has(f.name))];
    isDone = page.length < PER_PAGE;
    isGetting = false;
    // Still intersecting after a short page fires nothing, so look again.
    if (!isDone && sentinel) {
      observer.unobserve(sentinel);
      observer.observe(sentinel);
    }
  }

  $effect(() => {
    items = [...fileNameList];
    generation += 1;
    isGetting = false;
    isDone = fileNameList.length < FIRST_LIMIT;
    if (!sentinel || strip) return;
    // Starts 800px early; at 300px a quick scroll outran the fetch.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore(observer);
      },
      { rootMargin: "0px 0px 800px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });
</script>

{#if items.length === 0}
  {@render empty?.()}
{/if}
<!-- overflow は切らない (端のタイルのホバーの拡大が欠ける) -->
<div class="tiles" class:strip>
  {#each items as file, i (file.name)}
    <!-- The tile cannot be a <button>: the overlay buttons inside it would nest. -->
    <!-- --i staggers the entrance, restarting every 12 for appended pages. -->
    <div
      class="tile"
      style:--i={i % 12}
      style:aspect-ratio={strip ? `${file.width} / ${file.height}` : undefined}
    >
      <!-- The whole picture copies, the reason anyone is here. -->
      <button
        class="pic"
        aria-label="画像タグをコピー"
        onclick={() => copyTile(file.name)}
        type="button"
      >
        <!-- The size up front keeps tiles from jumping when the bytes arrive. -->
        <img
          src={`/images/${file.name}`}
          alt="LGTM"
          width={file.width}
          height={file.height}
          loading={i < EAGER ? "eager" : "lazy"}
          decoding="async"
          {@attach markLoaded}
        />
      </button>
      <!-- Says what a click does, then that it worked, in the same place. -->
      <div class="center" aria-hidden="true">
        <div class="badge" class:done={copied === file.name}>
          {#key copied === file.name}
            <span class="say">
              {#if copied === file.name}
                <svg
                  class="tick"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
                <span class="text done-text">コピーしました</span>
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-width="2"
                    d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
                  />
                </svg>
                <span class="text">コピー</span>
              {/if}
            </span>
          {/key}
        </div>
      </div>
      <!-- One row; an armed delete grows leftwards from the right edge. -->
      <div class="acts">
        {#if file.isDeletable && folders}
          <button
            type="button"
            class="on-media"
            aria-label="フォルダへ移す"
            title="フォルダへ移す"
            onclick={(e) => {
              e.stopPropagation();
              moveDialog?.open(file);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776"
              />
            </svg>
          </button>
        {/if}
        {#if file.isDeletable}
          <DeleteButton
            fileName={file.name}
            onDeleted={() => removeItem(file.name)}
          />
        {/if}
        <PreviewButton onOpen={() => onClickItem(file)} />
      </div>
    </div>
  {/each}
</div>
{#if !strip}<div bind:this={sentinel}></div>{/if}
{#if folders}
  <MoveDialog bind:this={moveDialog} {folders} onMoved={moved} />
{/if}
<dialog bind:this={dialog}>
  <!-- 既定の箱は 32rem で止まるので、画面まで伸ばす -->
  <div class="box">
    <div class="shot">
      {#if diaImage}
        <div class="acts">
          {#if diaImage.isDeletable}
            <DeleteButton
              fileName={diaImage.name}
              onDeleted={() => {
                if (diaImage) removeItem(diaImage.name);
                closeDialog();
              }}
            />
          {/if}
          <CopyButton
            text={() => lgtmImgTag(diaImage?.name ?? "")}
            onClick={closeDialog}
          />
        </div>
        <!-- Width from the proportions, so it fills the window without stretching. -->
        <img
          src={`/images/${diaImage.name}`}
          alt="LGTM"
          width={diaImage.width}
          height={diaImage.height}
          style={`width: min(86vw, calc(88vh * ${diaImage.width / diaImage.height}))`}
        />
      {:else}
        <div class="blank"></div>
      {/if}
    </div>
  </div>
  <form method="dialog" class="back">
    <button type="button" onclick={closeDialog}>close</button>
  </form>
</dialog>

<style>
  /* 画像の上の操作は塗らず、消えていく影に白で置く (denpa の docs/design.md「映像の上の操作」) */

  /* ---- 一覧 ---- */
  .tiles {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    /* ヘッダーとの間もタイル同士の間と同じ幅にする */
    padding-block: 0.75rem;
  }
  /* トップのグループの段。横に流し、端で止まる */
  .tiles.strip {
    flex-wrap: nowrap;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
    padding-block: 0.5rem 0.75rem;
  }
  .strip .tile {
    flex: 0 0 auto;
    height: 11rem;
    scroll-snap-align: start;
  }
  .tile {
    position: relative;
    flex-grow: 1;
    max-width: 32rem;
    height: 16rem;
    overflow: hidden;
    border-radius: var(--ui-radius-lg);
    background: var(--ui-subtle);
    /* 下からふわっと、少しずつずらして並ぶ */
    animation: ui-rise 520ms var(--ui-ease-out) both;
    animation-delay: calc(var(--i, 0) * 45ms);
  }
  /* 読み込み中は光の筋が流れる */
  .tile::before {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      100deg,
      transparent 30%,
      var(--ui-sweep) 50%,
      transparent 70%
    );
    content: "";
    animation: ui-shine 1.6s linear infinite;
    pointer-events: none;
  }
  .tile:has(img:global(.loaded))::before {
    display: none;
  }
  /* 画像そのものがボタン。ボタンらしい地・影・形は要らない */
  .pic {
    --pico-background-color: transparent;
    --pico-box-shadow: none;
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 0;
    padding: 0;
    cursor: pointer;
  }
  .pic:active {
    transform: none;
  }
  /* 届いたら少し縮みながら浮かび上がる。乗せるとゆっくり寄る */
  .pic img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transform: scale(1.04);
    transition:
      opacity 360ms var(--ui-ease-out),
      transform 600ms var(--ui-ease-out);
  }
  .pic img:global(.loaded) {
    opacity: 1;
    transform: none;
  }
  @media (hover: hover) {
    .tile:hover .pic img:global(.loaded) {
      transform: scale(1.035);
    }
  }
  /* キーボードで触っているタイルは、角に沿った外側の線 (切れないよう内側に引く) */
  .pic:focus-visible {
    outline-offset: -2px;
    border-radius: var(--ui-radius-lg);
  }

  /* 右上の操作。裏に上から消えていく影を敷く */
  .acts {
    display: flex;
    position: absolute;
    inset: 0 0 auto;
    justify-content: flex-end;
    gap: 0.125rem;
    background: linear-gradient(var(--ui-media-shade), transparent);
    padding: 0.375rem 0.375rem 1.5rem;
    pointer-events: none;
    transition: opacity var(--ui-duration) var(--ui-ease);
  }
  .acts > :global(*) {
    pointer-events: auto;
  }
  /* 画像が来るまでは影を敷かない (地の色の上に黒い帯だけが乗って見える) */
  .tile:has(img:not(:global(.loaded))) .acts {
    background: none;
  }
  /* 真ん中のカプセル。乗せると「コピー」、押すと同じ場所で「✓ コピーしました」 */
  /* 層の幅で字の長さを選ぶ。タイルそのものを入れ物にすると幅が潰れる */
  .center {
    display: grid;
    position: absolute;
    inset: 0;
    place-items: center;
    padding-inline: 0.5rem;
    pointer-events: none;
    container-type: inline-size;
  }
  .badge {
    max-width: 100%;
    border-radius: var(--ui-radius-full);
    background: var(--ui-pop);
    box-shadow: var(--ui-shadow-pop);
    padding: 0.5rem 1rem;
    color: var(--ui-fg);
    font-size: var(--ui-text-sm);
    font-weight: 700;
    white-space: nowrap;
    opacity: 0;
    scale: 0.94;
    transition:
      opacity 200ms var(--ui-ease),
      scale 260ms var(--ui-ease-out);
  }
  .badge.done {
    opacity: 1;
    scale: 1;
  }
  /* 字が入れ替わるときは、中身だけが小さく膨らんで現れる */
  .say {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    animation: ui-pop 240ms var(--ui-ease-out) both;
  }
  .say svg {
    flex-shrink: 0;
    width: 1.125rem;
    height: 1.125rem;
  }
  /* 狭いタイルでは字を落として印だけにする */
  @container (max-width: 11rem) {
    .done-text {
      display: none;
    }
  }
  @container (max-width: 7rem) {
    .text {
      display: none;
    }
    .badge {
      padding-inline: 0.5rem;
    }
  }
  /* できた印は主の色で、線を描くように現れる */
  .tick {
    color: var(--pico-primary);
    stroke-dasharray: 24;
    animation: badge-tick 360ms var(--ui-ease-out) 60ms both;
  }
  @keyframes badge-tick {
    from {
      stroke-dashoffset: 24;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
  @media (hover: hover) {
    .acts {
      opacity: 0;
    }
    /* 確定待ちの削除は、指を離しても見えたままにする */
    .tile:is(:hover, :focus-within) .acts,
    .tile .acts:has(:global(.armed)) {
      opacity: 1;
    }
    .tile:hover .badge {
      opacity: 1;
      scale: 1;
    }
  }

  /* 動きを減らす設定では、寄る・縮む動きも付けない (app.css が時間を 0 にする) */
  @media (prefers-reduced-motion: reduce) {
    .pic img,
    .tile:hover .pic img:global(.loaded) {
      transform: none;
    }
  }

  /* ---- 拡大表示 ---- */
  /* ダイアログは面と影だけ。後ろの幕はぼかさない */
  dialog {
    --pico-modal-overlay-background-color: var(--ui-backdrop);
    --pico-modal-overlay-backdrop-filter: none;
    backdrop-filter: none;
  }
  /* 開くと幕がふわっと暗くなり、箱が少し小さいところから膨らんで出る */
  dialog[open] {
    animation: ui-fade 200ms var(--ui-ease) both;
  }
  dialog[open] .box {
    animation: ui-pop 280ms var(--ui-ease-out) both;
  }
  .box {
    z-index: 1;
    position: relative;
    width: auto;
    max-width: 92vw;
    border-radius: var(--ui-radius-lg);
    background: var(--ui-surface);
    box-shadow: var(--ui-shadow-pop);
    padding: 0.5rem;
  }
  .shot {
    position: relative;
    overflow: hidden;
    border-radius: var(--ui-radius);
  }
  .shot .acts {
    opacity: 1;
  }
  @media (hover: hover) {
    .shot .acts {
      opacity: 0;
    }
    .shot:is(:hover, :focus-within) .acts,
    .shot .acts:has(:global(.armed)) {
      opacity: 1;
    }
  }
  .shot img {
    display: block;
    max-width: 86vw;
    max-height: 88vh;
    height: auto;
  }
  .blank {
    width: 100%;
    height: 100%;
    border-radius: var(--ui-radius);
    background: var(--ui-subtle);
  }
  /* 箱の外をクリックすると閉じる。全面に敷いた透明なボタンがその当たり判定 */
  .back {
    position: absolute;
    inset: 0;
    margin: 0;
  }
  .back button {
    --pico-background-color: transparent;
    --pico-box-shadow: none;
    width: 100%;
    height: 100%;
    border-radius: 0;
    padding: 0;
    color: transparent;
    cursor: pointer;
  }
  .back button:active {
    transform: none;
  }
</style>
