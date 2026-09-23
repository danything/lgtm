<script lang="ts" module>
export type File = {
	name: string;
	isDeletable: boolean;
	width: number;
	height: number;
};
</script>

<script lang="ts">
	import { untrack } from "svelte";
	import { copyAndReport, lgtmMarkdown } from "$lib/clipboard";
	import { PER_PAGE } from "$lib/paging";
	import CopyButton from "./CopyButton.svelte";
	import DeleteButton from "./DeleteButton.svelte";
	import PreviewButton from "./PreviewButton.svelte";

	let {
		fileNameList,
		userKey,
		find,
	}: {
		fileNameList: File[];
		userKey?: string;
		find: boolean;
	} = $props();

	// Seeds SSR output with the initial page; the $effect below only re-syncs
	// on later prop changes, which now means an upload or a delete calling
	// invalidateAll. Reading the prop through untrack says that capturing just
	// this first value is the point, rather than an oversight the compiler
	// should flag.
	let items = $state<File[]>(untrack(() => fileNameList));
	// Plain variables rather than $state: nothing renders from them, and the
	// effect below resets them, so tracking them would make it depend on its
	// own writes.
	let page = 2;
	let isGetting = false;
	let isDone = false;
	let sentinel: HTMLDivElement | undefined = $state();
	let diaImage = $state<File>();
	let dialog: HTMLDialogElement | undefined = $state();

	function onClickItem(file: File) {
		diaImage = file;
		dialog?.showModal();
	}
	function closeDialog() {
		dialog?.close();
	}

	// Marks the picture once its bytes are in, which ends the tile's pulse and
	// fades the image up. A server-rendered image can finish before hydration
	// attaches the listener, so one that is already complete counts at once.
	// An error counts too: a broken file is not going to arrive by waiting.
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
		const res = await fetch(`/lgtm/images?page=${page}&find=${find}`);
		const pageList: File[] = await res.json();
		items = [...items, ...pageList];
		page += 1;
		// A short page is the last one.
		isDone = pageList.length < PER_PAGE;
		isGetting = false;
		// The observer only reports changes. If this page was too short to push
		// the sentinel out of reach it stays intersecting and nothing fires
		// again, so observe it afresh, which reports where it stands now.
		if (!isDone && sentinel) {
			observer.unobserve(sentinel);
			observer.observe(sentinel);
		}
	}

	$effect(() => {
		items = [...fileNameList];
		page = 2;
		isGetting = false;
		isDone = fileNameList.length < PER_PAGE;
		if (!sentinel) return;
		// Watches a marker after the last tile instead of measuring the page on
		// every scroll event; the margin starts the fetch 300px before it shows.
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) loadMore(observer);
			},
			{ rootMargin: "0px 0px 300px 0px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});
</script>

<!-- ここでは overflow を切らない: 箱に overflow-x を付けると両方の軸が切られ、
     行の端でホバーの拡大が欠けた。タイルの幅は 32rem 止まりなので 5% 伸びても
     片側 13px ほどで、ページ側の左右 1rem の余白に収まる。 -->
<div class="tiles">
	{#each items as file (file.name)}
		<!--
			The preview and delete buttons overlay the tile, so they have to be
			positioned against it -- but they cannot be *inside* it while the tile
			is itself a <button>. Nested buttons are invalid, and the parser
			resolves them by closing the outer one early, which left the tile empty
			and threw the image and the overlays out into the row. Keep the tile as
			a plain positioned element and let the image be the button.
		-->
		<div class="tile">
			<!-- The tile copies. Getting the markdown is why anyone is here, so it
			     is the whole picture rather than a button on top of it; the other
			     thing you might have wanted is the button. -->
			<button
				class="pic"
				aria-label="リンクをコピー"
				onclick={() =>
					copyAndReport(
						lgtmMarkdown(file.name),
						"リンクをコピーしました",
						"コピーできませんでした",
					)}
				type="button"
			>
				<!-- The tile's width comes from the picture's proportions, so they
				     have to be known before it loads. Guessing a square here made
				     every tile start 256px wide and jump once the image arrived,
				     reflowing the whole row. -->
				<img
					src={`/images/${file.name}`}
					alt="LGTM"
					width={file.width}
					height={file.height}
					loading="lazy"
					decoding="async"
					{@attach markLoaded}
				/>
			</button>
			<!-- Clicking the picture copies, which nothing about a picture says.
			     Hovering is the moment to mention it, and the only moment it is
			     worth covering the image to do so. pointer-events-none so the
			     thing it describes still receives the click. -->
			<div class="veil">
				<span>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<title>Copy</title>
						<path
							stroke-width="2"
							d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
						/>
					</svg>
					クリックでリンクをコピー
				</span>
			</div>
			<!-- One row, so the two never have to know each other's size: delete
			     sits to the left, and an armed delete grows leftwards from the
			     right edge rather than pushing its neighbour along. -->
			<div class="acts">
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
<div bind:this={sentinel}></div>
<dialog bind:this={dialog}>
	<!--
		既定の箱は幅 32rem で止まり、拡大してもタイルと大差ない大きさだった。画面まで
		伸ばせるようにして、縦長の画像は下の img 側で高さのほうを効かせて収める。
	-->
	<div class="panel box">
		<div class="shot">
			{#if diaImage}
				<div class="acts">
					{#if diaImage.isDeletable}
						<DeleteButton
							fileName={diaImage.name}
							isVisible={false}
							onDeleted={() => {
								if (diaImage) removeItem(diaImage.name);
								closeDialog();
							}}
						/>
					{/if}
					<CopyButton
						text={() => lgtmMarkdown(diaImage?.name ?? "")}
						onClick={closeDialog}
						isVisible={false}
					/>
				</div>
				<!--
					Uploads are capped at 960px but most are well under it, and leaving
					the width to the image renders those at 1:1 -- a 500px wide one sat
					in an 8% corner of the screen. Asking for a width instead doesn't
					work either: a max-height then clamps the height without pulling the
					width back with it, and the picture stretches. So take the width from
					the image's own proportions, picking whichever of the two limits
					binds first. It fills the window, keeps its shape, and never spills.
				-->
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
/* ---- 一覧 ---- */
.tiles {
	display: flex;
	flex-wrap: wrap;
	gap: 0.75rem;
	padding-block: 0.75rem;
}
.tile {
	position: relative;
	flex-grow: 1;
	max-width: 32rem;
	height: 16rem;
	overflow: hidden;
	border-radius: var(--pico-border-radius);
	background: var(--ui-base-200);
	transition: all 0.15s;
}
/* 読み込み中はタイルの地の色を明滅させてスケルトンにする */
.tile:has(img:not(:global(.loaded))) {
	animation: tile-pulse 1.5s ease-in-out infinite;
}
/* 上に乗るボタンまで明滅しないよう、動かすのは地の色だけ */
@keyframes tile-pulse {
	50% {
		background: var(--ui-base-300);
	}
}
.tile:hover {
	z-index: 10;
	transform: scale(1.05);
}
/* 画像そのものがボタン。ボタンらしい枠や地の色は要らない */
.pic {
	display: block;
	width: 100%;
	height: 100%;
	min-height: 0;
	border: 0;
	border-radius: 0;
	padding: 0;
	background: transparent;
	cursor: pointer;
}
.pic img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	opacity: 0;
	transition: opacity 0.3s;
}
.pic img:global(.loaded) {
	opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
	.tile {
		animation: none !important;
	}
	.pic img {
		transition: none;
	}
}
.veil {
	pointer-events: none;
	display: grid;
	position: absolute;
	inset: 0;
	place-items: center;
	gap: 0.25rem;
	background: var(--ui-veil);
	color: var(--ui-veil-color);
	opacity: 0;
	transition: opacity 0.15s;
}
.tile:hover .veil {
	opacity: 1;
}
.veil span {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	font-weight: 700;
}
.veil svg {
	width: 1.25rem;
	height: 1.25rem;
}
.acts {
	display: flex;
	position: absolute;
	top: 0.75rem;
	right: 0.75rem;
	gap: 0.5rem;
}

/* ---- 拡大表示 ---- */
.box {
	z-index: 1;
	position: relative;
	width: auto;
	max-width: 92vw;
	padding: 0.5rem;
}
.shot {
	position: relative;
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
	border-radius: var(--pico-border-radius);
	background: var(--ui-base-200);
}
/* 箱の外をクリックすると閉じる。全面に敷いた透明なボタンがその当たり判定 */
.back {
	position: absolute;
	inset: 0;
	margin: 0;
}
.back button {
	width: 100%;
	height: 100%;
	min-height: 0;
	border: 0;
	border-radius: 0;
	padding: 0;
	background: transparent;
	color: transparent;
	cursor: pointer;
}
</style>
