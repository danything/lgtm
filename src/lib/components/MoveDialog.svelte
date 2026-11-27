<script lang="ts">
  import { postJson } from "#lib/api.js";
  import type { Folder } from "#lib/folders.js";
  import { setError, setMessage } from "#lib/stores/toast.svelte.js";

  let {
    folders,
    onMoved,
  }: {
    folders: Folder[];
    onMoved: (fileName: string, from: number | null, to: number | null) => void;
  } = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  let target = $state<{ name: string; folderId: number | null }>();
  let busy = $state(false);

  export function open(file: { name: string; folderId: number | null }) {
    target = file;
    dialog?.showModal();
  }

  async function move(to: number | null) {
    const file = target;
    if (!file || to === file.folderId) {
      dialog?.close();
      return;
    }
    busy = true;
    try {
      await postJson("/lgtm/move", { fileNames: [file.name], folderId: to });
      onMoved(file.name, file.folderId, to);
      const name = folders.find((f) => f.id === to)?.name ?? "未分類";
      setMessage(`「${name}」へ移しました`);
      dialog?.close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy = false;
    }
  }

  const choices = $derived([
    { id: null, name: "未分類" },
    ...folders.map(({ id, name }) => ({ id: id as number | null, name })),
  ]);
</script>

<dialog bind:this={dialog} aria-labelledby="move-title">
  <div class="box">
    <h2 id="move-title">フォルダへ移す</h2>
    {#if folders.length === 0}
      <p class="muted small">
        フォルダがまだありません。上の「＋ フォルダ」から作れます。
      </p>
    {/if}
    <ul>
      {#each choices as c (c.id)}
        <li>
          <button
            type="button"
            class="ghost"
            class:on={c.id === target?.folderId}
            aria-current={c.id === target?.folderId}
            disabled={busy}
            onclick={() => move(c.id)}
          >
            {c.name}
            {#if c.id === target?.folderId}<span class="muted small"
                >いまここ</span
              >{/if}
          </button>
        </li>
      {/each}
    </ul>
  </div>
  <form method="dialog" class="back">
    <button type="submit" aria-label="閉じる">閉じる</button>
  </form>
</dialog>

<style>
  dialog {
    --pico-modal-overlay-background-color: var(--ui-backdrop);
    --pico-modal-overlay-backdrop-filter: none;
    backdrop-filter: none;
  }
  dialog[open] {
    animation: ui-fade 200ms var(--ui-ease) both;
  }
  dialog[open] .box {
    animation: ui-pop 280ms var(--ui-ease-out) both;
  }
  .box {
    z-index: 1;
    position: relative;
    width: min(22rem, 92vw);
    max-height: 80vh;
    overflow-y: auto;
    border-radius: var(--ui-radius-lg);
    background: var(--ui-surface);
    box-shadow: var(--ui-shadow-pop);
    padding: 1rem;
  }
  h2 {
    margin-bottom: 0.5rem;
    font-size: 1rem;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    list-style: none;
  }
  li button {
    justify-content: space-between;
    width: 100%;
    font-weight: 400;
  }
  li button.on {
    color: var(--ui-primary-text);
    font-weight: 700;
  }
  /* 箱の外のクリックで閉じる、全面の透明なボタン */
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
    color: transparent;
    cursor: pointer;
  }
</style>
