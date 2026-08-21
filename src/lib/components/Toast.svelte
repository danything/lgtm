<script lang="ts">
import { toastStore } from "$lib/stores/toast.svelte";

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

<div class={`toast transition-all ${isShow ? "" : "opacity-0"}`}>
	{#each messageList as mes (mes.id)}
		<div class="alert alert-info">
			<span>{mes.text}</span>
		</div>
	{/each}
</div>
