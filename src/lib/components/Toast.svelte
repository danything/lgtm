<script lang="ts">
  import { toastStore } from "#lib/stores/toast.svelte.js";

  /** How long a message shows, in ms; errors get time to be read. */
  const SHOW = { info: 1500, error: 6000 };

  let messageList = $state<{ id: number; text: string; error: boolean }[]>([]);
  let isShow = $state(true);
  let showTimeout: ReturnType<typeof setTimeout> | undefined;
  let messageTimeout: ReturnType<typeof setTimeout> | undefined;
  let nextId = 0;

  $effect(() => {
    const message = toastStore.message;
    if (!message) return;
    toastStore.message = undefined;
    isShow = true;
    nextId += 1;
    messageList = [{ id: nextId, ...message }, ...messageList];
    const show = messageList.some((m) => m.error) ? SHOW.error : SHOW.info;
    clearTimeout(showTimeout);
    clearTimeout(messageTimeout);
    showTimeout = setTimeout(() => (isShow = false), show);
    messageTimeout = setTimeout(() => (messageList = []), show + 500);
  });
</script>

<div class="toast" class:hide={!isShow} role="status" aria-live="polite">
  {#each messageList as mes (mes.id)}
    <div class="msg" class:error={mes.error}>{mes.text}</div>
  {/each}
</div>

<style>
  /*
 * 通知は操作の層 (面と影のカプセル。縁は付けない)。字は本文の色で、状態の色は使わない。
 * 画面の下の真ん中に積む。消えるときは透明にするだけで、場所は動かさない
 */
  .toast {
    display: flex;
    z-index: 60;
    position: fixed;
    inset-inline: 0;
    bottom: 1rem;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding-inline: 1rem;
    pointer-events: none;
    transition:
      opacity 240ms var(--ui-ease),
      translate 240ms var(--ui-ease);
  }
  /* 消えるときは少し沈みながら薄くなる */
  .hide {
    opacity: 0;
    translate: 0 0.5rem;
  }
  .msg {
    border-radius: var(--ui-radius-full);
    background: var(--ui-pop);
    box-shadow: var(--ui-shadow-pop);
    padding: 0.625rem 1.125rem;
    color: var(--ui-fg);
    font-size: var(--ui-text-sm);
    font-weight: 700;
    /* 下からふわっと浮かんで出る */
    animation: ui-rise 320ms var(--ui-ease-out) both;
  }
  /* 失敗は赤い印で分ける (字の色は変えない)。長い文は折り返す */
  .msg.error {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    max-width: min(36rem, 100%);
    border-radius: var(--ui-radius-lg);
  }
  .msg.error::before {
    flex-shrink: 0;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--ui-err);
    content: "";
  }
</style>
