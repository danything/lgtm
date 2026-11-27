<script lang="ts">
  import { refreshAll } from "$app/navigation";

  import { copyText, lgtmImgTag } from "#lib/clipboard.js";
  import { setError, setMessage } from "#lib/stores/toast.svelte.js";
  import { uploadErrorMessage, uploadPictures } from "#lib/upload.js";

  let isGenerating = $state(false);
  // 0..1 across the batch; a long animation takes seconds.
  let progress = $state(0);
  let inputRef: HTMLInputElement | undefined = $state();
  // dragenter/leave fire per element crossed, so count rather than toggle.
  let depth = $state(0);
  const dragging = $derived(depth > 0);

  async function upload(files: FileList) {
    try {
      isGenerating = true;
      progress = 0;
      const created = await uploadPictures([...files], (p) => (progress = p));
      // The tag is what people came for, so it goes straight to the clipboard.
      const copied =
        created.length > 0 &&
        (await copyText(created.map(lgtmImgTag).join("\n")));
      setMessage(
        copied
          ? created.length > 1
            ? `${created.length}件コピーしました`
            : "コピーしました"
          : "画像生成完了",
      );
    } catch (e) {
      setError(uploadErrorMessage(e));
    } finally {
      await refreshAll();
      if (inputRef) inputRef.value = "";
      isGenerating = false;
    }
  }

  const hasFiles = (event: DragEvent) =>
    event.dataTransfer?.types.includes("Files") ?? false;

  $effect(() => {
    const enter = (event: DragEvent) => {
      if (hasFiles(event)) depth += 1;
    };
    const leave = (event: DragEvent) => {
      if (hasFiles(event)) depth -= 1;
    };
    // Otherwise the browser opens the file instead.
    const over = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      depth = 0;
      if (!hasFiles(event)) return;
      event.preventDefault();
      const files = event.dataTransfer?.files;
      if (!isGenerating && files?.length) upload(files);
    };
    document.addEventListener("dragenter", enter);
    document.addEventListener("dragleave", leave);
    document.addEventListener("dragover", over);
    document.addEventListener("drop", drop);
    return () => {
      document.removeEventListener("dragenter", enter);
      document.removeEventListener("dragleave", leave);
      document.removeEventListener("dragover", over);
      document.removeEventListener("drop", drop);
    };
  });
</script>

<input
  bind:this={inputRef}
  accept="image/*,.heic,.heif"
  type="file"
  multiple
  onchange={() => {
    if (inputRef?.files?.length) upload(inputRef.files);
  }}
/>
<button type="button" disabled={isGenerating} onclick={() => inputRef?.click()}>
  {#if isGenerating}
    <span class="spin"></span>
    生成中
    <span class="pct">{Math.floor(progress * 100)}%</span>
  {:else}
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="2.25"
        d="M12 5v14M5 12h14"
      />
    </svg>
    <span class="label">画像を追加</span>
  {/if}
</button>

{#if dragging}
  <!-- 受け皿はウィンドウ全体。pointer-events: none でドロップを飲み込まない -->
  <div class="veil">
    <div class="frame">ここにドロップ</div>
  </div>
{/if}

<style>
  /* ボタンから開くので、入力欄そのものは出さない */
  input {
    display: none;
  }
  svg {
    width: 1.125rem;
    height: 1.125rem;
  }
  /* 狭い画面では＋の印だけ。名前は読み上げに残す */
  @media (max-width: 479px) {
    .label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  /* 数字でボタンの幅が揺れないよう、等幅で "100%" の幅を取っておく */
  .pct {
    min-width: 4ch;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .veil {
    pointer-events: none;
    z-index: 50;
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--ui-bg) 80%, transparent);
    padding: 0.75rem;
    animation: ui-fade 160ms var(--ui-ease) both;
  }
  .frame {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    border: 2px dashed var(--pico-primary);
    border-radius: 1.25rem;
    color: var(--ui-fg);
    font-size: 1.5rem;
    font-weight: 700;
    /* 広がって出て、落としてよいことを脈打って示す */
    animation:
      ui-pop 280ms var(--ui-ease-out) both,
      frame-breathe 1.4s ease-in-out 280ms infinite;
  }
  @keyframes frame-breathe {
    50% {
      border-color: color-mix(in srgb, var(--pico-primary) 45%, transparent);
    }
  }
</style>
