<script lang="ts">
  import { ApiError, postJson } from "#lib/api.js";
  import { onWindowClick } from "#lib/outside-click.js";
  import { setError, setMessage } from "#lib/stores/toast.svelte.js";

  let {
    fileName,
    onDeleted,
  }: {
    fileName: string;
    onDeleted?: () => void;
  } = $props();

  // It cannot be undone, so the first click only arms it and any other click
  // disarms it.
  let armed = $state(false);
  let deleting = $state(false);

  $effect(() => {
    if (armed) return onWindowClick(() => (armed = false));
  });

  async function onClickDelete(e: MouseEvent) {
    // Keeps the window listener from disarming on the arming click.
    e.stopPropagation();
    if (!armed) {
      armed = true;
      return;
    }
    armed = false;
    deleting = true;
    try {
      await postJson("/lgtm/delete", { fileName });
      onDeleted?.();
      setMessage("画像削除完了");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "削除できませんでした");
    } finally {
      deleting = false;
    }
  }
</script>

<button
  type="button"
  class="on-media"
  class:armed
  disabled={deleting}
  aria-label={armed ? "削除を確定" : "削除"}
  title={armed ? "もう一度押すと削除" : "削除"}
  onclick={onClickDelete}
>
  {#if deleting}
    <span class="spin"></span>
  {:else}
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        stroke-width="2"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
    {#if armed}<span class="label">削除</span>{/if}
  {/if}
</button>

<style>
  /* 確定待ちは字のぶん、右端から左へ伸びる */
  .armed {
    width: auto;
    padding-inline: 0.625rem 0.75rem;
    /* 確かめを待っていると揺れて知らせる */
    animation: ui-nudge 320ms var(--ui-ease) both;
  }
  .label {
    font-size: var(--ui-text-sm);
    font-weight: 700;
  }
</style>
