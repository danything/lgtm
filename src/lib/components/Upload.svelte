<script lang="ts">
import { copyText, lgtmImgTag } from "#lib/clipboard.js";
import { makeLgtm, UnsupportedBrowserError } from "#lib/lgtm/index.js";
import { setMessage } from "#lib/stores/toast.svelte.js";
import { refreshAll } from "$app/navigation";

let isGenerating = $state(false);
// 0..1 across the whole batch. A long animation takes seconds, and a bare
// "生成中" gives no sign it is getting anywhere.
let progress = $state(0);
let inputRef: HTMLInputElement | undefined = $state();
// dragenter and dragleave fire again for every element the pointer crosses, so
// a plain boolean flickers as the file moves over the page. Counting entries
// against leaves is what actually answers "is a file still over the window".
let depth = $state(0);
const dragging = $derived(depth > 0);

async function upload(files: FileList) {
	try {
		isGenerating = true;
		progress = 0;
		// Converted and stamped here, in the browser; the server only checks
		// and stores what it is sent.
		const formData = new FormData();
		for (const file of await makeLgtm([...files], (p) => (progress = p)))
			formData.append("files", file);
		const res = await fetch("/lgtm/upload", { method: "POST", body: formData });
		if (!res.ok) throw new Error("upload failed");
		const { files: created }: { files: string[] } = await res.json();
		// Straight onto the clipboard: what you came here for is the tag,
		// and the alternative is finding the new tile and clicking it.
		const copied =
			created.length > 0 &&
			(await copyText(created.map(lgtmImgTag).join("\n")));
		setMessage(
			copied
				? created.length > 1
					? `${created.length}件のリンクをコピーしました`
					: "リンクをコピーしました"
				: "画像生成完了",
		);
	} catch (e) {
		setMessage(
			e instanceof UnsupportedBrowserError
				? "このブラウザでは画像を変換できません。最新のブラウザでお試しください"
				: "画像生成失敗",
		);
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
	disabled={isGenerating}
	onclick={() => inputRef?.click()}
>
	{#if isGenerating}
		<span class="spin"></span>
		生成中
		<span class="pct">{Math.floor(progress * 100)}%</span>
	{:else}
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
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
svg {
	width: 1.125rem;
	height: 1.125rem;
}
/*
 * 狭い画面ではヘッダーに収まらないので、＋の印だけにする。名前は読み上げに残す
 * (見えないだけで、ボタンの名前は「画像を追加」のまま)
 */
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
/* 数字が変わるたびにボタンの幅が変わると、ヘッダーの並びまで揺れる。
   等幅の数字で、いちばん長い "100%" の幅を最初から取っておく */
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
}
/* 受け皿はウィンドウそのもの。線は主の色 (線は主の色の役目)、字は本文の色 */
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
}
</style>
