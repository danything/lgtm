<script lang="ts">
import { toastStore } from "#lib/stores/toast.svelte.js";

let messageList = $state<{ id: number; text: string }[]>([]);
let isShow = $state(true);
let showTimeout: ReturnType<typeof setTimeout> | undefined;
let messageTimeout: ReturnType<typeof setTimeout> | undefined;
let nextId = 0;

$effect(() => {
	const message = toastStore.message;
	if (message) {
		isShow = true;
		nextId += 1;
		messageList = [{ id: nextId, text: message }, ...messageList];
		toastStore.message = undefined;
		if (showTimeout) clearTimeout(showTimeout);
		if (messageTimeout) clearTimeout(messageTimeout);
		showTimeout = setTimeout(() => {
			isShow = false;
		}, 1500);
		messageTimeout = setTimeout(() => {
			messageList = [];
		}, 2000);
	}
});
</script>

<div class="toast" class:hide={!isShow} role="status" aria-live="polite">
	{#each messageList as mes (mes.id)}
		<div class="msg">{mes.text}</div>
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
	transition: opacity var(--ui-duration) var(--ui-ease);
}
.hide {
	opacity: 0;
}
.msg {
	border-radius: var(--ui-radius-full);
	background: var(--ui-pop);
	box-shadow: var(--ui-shadow-pop);
	padding: 0.625rem 1.125rem;
	color: var(--ui-fg);
	font-size: var(--ui-text-sm);
	font-weight: 700;
}
</style>