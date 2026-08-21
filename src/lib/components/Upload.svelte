<script lang="ts">
import { invalidateAll } from "$app/navigation";
import { setMessage } from "$lib/stores/toast.svelte";

let isGenerating = $state(false);
let inputRef: HTMLInputElement | undefined = $state();

async function onSelectImage() {
	if (!inputRef?.files) return;
	try {
		isGenerating = true;
		const formData = new FormData();
		for (const file of inputRef.files) {
			formData.append("files", file);
		}
		const res = await fetch("/lgtm/upload", {
			method: "POST",
			body: formData,
		});
		if (!res.ok) throw new Error("upload failed");
		setMessage("画像生成完了");
	} catch {
		setMessage("画像生成失敗");
	} finally {
		await invalidateAll();
		if (inputRef) inputRef.value = "";
		isGenerating = false;
	}
}

function onDrop(ev: DragEvent) {
	ev.preventDefault();
	if (!isGenerating && ev.dataTransfer?.files && inputRef) {
		inputRef.files = ev.dataTransfer.files;
		onSelectImage();
	}
}
function onDragOver(ev: DragEvent) {
	ev.preventDefault();
}

$effect(() => {
	document.addEventListener("drop", onDrop);
	document.addEventListener("dragover", onDragOver);
	return () => {
		document.removeEventListener("drop", onDrop);
		document.removeEventListener("dragover", onDragOver);
	};
});
</script>

<div>
	<input
		bind:this={inputRef}
		accept="image/*"
		type="file"
		class="file-input w-full max-w-xs"
		disabled={isGenerating}
		multiple
		onchange={onSelectImage}
	/>
	{#if isGenerating}
		<progress class="progress w-52 ml-4"></progress>
		<span class="ml-4">画像生成中</span>
	{/if}
</div>
