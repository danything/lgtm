<script lang="ts">
import { invalidateAll } from "$app/navigation";
import { copyText, lgtmMarkdown } from "$lib/clipboard";
import { setMessage } from "$lib/stores/toast.svelte";

let isGenerating = $state(false);
let inputRef: HTMLInputElement | undefined = $state();
// dragenter and dragleave fire again for every element the pointer crosses, so
// a plain boolean flickers as the file moves over the page. Counting entries
// against leaves is what actually answers "is a file still over the window".
let depth = $state(0);
const dragging = $derived(depth > 0);

async function upload(files: FileList) {
	try {
		isGenerating = true;
		const formData = new FormData();
		for (const file of files) formData.append("files", file);
		const res = await fetch("/lgtm/upload", { method: "POST", body: formData });
		if (!res.ok) throw new Error("upload failed");
		const { files: created }: { files: string[] } = await res.json();
		// Straight onto the clipboard: what you came here for is the markdown,
		// and the alternative is finding the new tile and clicking it.
		const copied =
			created.length > 0 &&
			(await copyText(created.map(lgtmMarkdown).join("\n")));
		setMessage(
			copied
				? created.length > 1
					? `${created.length}件のリンクをコピーしました`
					: "リンクをコピーしました"
				: "画像生成完了",
		);
	} catch {
		setMessage("画像生成失敗");
	} finally {
		await invalidateAll();
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
	// Without this the browser navigates to the file instead of handing it over.
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
	accept="image/*"
	type="file"
	multiple
	onchange={() => {
		if (inputRef?.files?.length) upload(inputRef.files);
	}}
/>
<button
	type="button"
	class="mini"
	disabled={isGenerating}
	onclick={() => inputRef?.click()}
>
	{#if isGenerating}
		<span class="spin"></span>
		生成中
	{:else}
		画像を追加
	{/if}
</button>

{#if dragging}
	<!--
		ウィンドウ全体が受け皿で、それが分かるのは要る瞬間だけ -- なのでその時だけ
		言い、残りの時間は何も言わない。pointer-events: none は、案内しているその
		ドロップ自体をこの幕が飲み込まないようにするため。
	-->
	<div class="veil">
		<!-- 枠はウィンドウそのもの。受け皿がウィンドウだからで、真ん中に箱を置くと
		     逆のことを言ってしまう。 -->
		<div class="frame">ここにドロップ</div>
	</div>
{/if}

<style>
/* ボタンから開くので、入力欄そのものは出さない */
input {
	display: none;
}
button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.4rem;
}
.veil {
	pointer-events: none;
	z-index: 50;
	position: fixed;
	inset: 0;
	background: color-mix(in srgb, var(--pico-background-color) 80%, transparent);
	padding: 1rem;
}
.frame {
	display: grid;
	place-items: center;
	width: 100%;
	height: 100%;
	border: 4px dashed var(--pico-primary);
	border-radius: 1.5rem;
	font-size: 1.5rem;
	font-weight: 700;
}
</style>
