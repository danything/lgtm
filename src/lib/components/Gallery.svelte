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
	import { copyAndReport, lgtmImgTag } from "#lib/clipboard.js";
	import { FIRST_LIMIT, PER_PAGE } from "#lib/paging.js";
	import CopyButton from "./CopyButton.svelte";
	import DeleteButton from "./DeleteButton.svelte";
	import PreviewButton from "./PreviewButton.svelte";
	import "@anyblades/blades/layered/components/modal";

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
	// refreshAll. Reading the prop through untrack says that capturing just
	// this first value is the point, rather than an oversight the compiler
	// should flag.
	// Roughly the first screen on a desktop; a phone shows fewer, and loading
	// a couple of extra up front costs less than delaying the ones in view.
	const EAGER = 6;

	let items = $state<File[]>(untrack(() => fileNameList));
	// Plain variables rather than $state: nothing renders from them, and the
	// effect below resets them, so tracking them would make it depend on its
	// own writes.
	let isGetting = false;
	// Bumped whenever the list is reset, so a fetch that was already in flight
	// cannot append its answer to the list that replaced the one it was for.
	let generation = 0;
	let isDone = false;
	let sentinel: HTMLDivElement | undefined = $state();
	let diaImage = $state<File>();
	// The tile whose link was just copied, for a moment: it shows a tick there,
	// where the click was, as well as the toast at the bottom. Only which tile;
	// the badge's coming and going is CSS.
	let copied = $state<string>();
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;

	async function copyTile(name: string) {
		const ok = await copyAndReport(
			lgtmImgTag(name),
			"リンクをコピーしました",
			"コピーできませんでした",
		);
		if (!ok) return;
		copied = name;
		clearTimeout(copiedTimer);
		copiedTimer = setTimeout(() => (copied = undefined), 1200);
	}
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
		const started = generation;
		const res = await fetch(
			`/lgtm/images?offset=${items.length}&limit=${PER_PAGE}&find=${find}`,
		);
		const pageList: File[] = await res.json();
		if (started !== generation) return;
		// Someone uploading in the meantime pushes everything down, so the
		// start of this batch can repeat the end of the last one. The list is
		// keyed by name, and a repeated key is an error, not a duplicate tile.
		const have = new Set(items.map((f) => f.name));
		items = [...items, ...pageList.filter((f) => !have.has(f.name))];
		// A short answer is the last one.
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
		generation += 1;
		isGetting = false;
		isDone = fileNameList.length < FIRST_LIMIT;
		if (!sentinel) return;
		// Watches a marker after the last tile instead of measuring the page on
		// every scroll event; the margin starts the fetch 800px before it shows.
		// At 300px a quick scroll on a desktop reached the end of the first 12
		// tiles before the next batch arrived.
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) loadMore(observer);
			},
			{ rootMargin: "0px 0px 800px 0px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});
</script>

<!-- ここでは overflow を切らない: 箱に overflow-x を付けると両方の軸が切られ、
     行の端でホバーの拡大が欠けた。タイルの幅は 32rem 止まりなので 5% 伸びても
     片側 13px ほどで、ページ側の左右 1rem の余白に収まる。 -->
<div class="tiles">
	{#each items as file, i (file.name)}
		<!--
			The preview and delete buttons overlay the tile, so they have to be
			positioned against it -- but they cannot be *inside* it while the tile
			is itself a <button>. Nested buttons are invalid, and the parser
			resolves them by closing the outer one early, which left the tile empty
			and threw the image and the overlays out into the row. Keep the tile as
			a plain positioned element and let the image be the button.
		-->
		<!-- --i staggers the tiles' entrance; it restarts every 12 so a page
		     appended by the scroll does not wait seconds for its last tiles. -->
		<div class="tile" style:--i={i % 12}>
			<!-- The tile copies. Getting the tag is why anyone is here, so it
			     is the whole picture rather than a button on top of it; the other
			     thing you might have wanted is the button. -->
			<button
				class="pic"
				aria-label="リンクをコピー"
				onclick={() => copyTile(file.name)}
				type="button"
			>
				<!-- The tile's width comes from the picture's proportions, so they
				     have to be known before it loads. Guessing a square here made
				     every tile start 256px wide and jump once the image arrived,
				     reflowing the whole row.
				     The first few are in view on arrival, and lazy would hold them
				     back until layout; everything after waits for the scroll. -->
				<img
					src={`/images/${file.name}`}
					alt="LGTM"
					width={file.width}
					height={file.height}
					loading={i < EAGER ? "eager" : "lazy"}
					decoding="async"
					{@attach markLoaded}
				/>
			</button>
			<!-- Clicking the picture copies, which nothing about a picture says.
			     Hovering is the moment to mention it: a line along the bottom
			     edge, over a shade that fades out upwards, so the picture itself
			     stays in view. pointer-events-none so the thing it describes
			     still receives the click. -->
			{#if copied === file.name}
				<div class="copied" aria-hidden="true">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="m5 12.5 4.5 4.5L19 7.5" />
					</svg>
					コピーしました
				</div>
			{/if}
			<div class="hint" aria-hidden="true">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-width="2"
						d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
					/>
				</svg>
				クリックでリンクをコピー
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
	<div class="box">
		<div class="shot">
			{#if diaImage}
				<div class="acts">
					{#if diaImage.isDeletable}
						<DeleteButton
							fileName={diaImage.name}
							onDeleted={() => {
								if (diaImage) removeItem(diaImage.name);
								closeDialog();
							}}
						/>
					{/if}
					<CopyButton
						text={() => lgtmImgTag(diaImage?.name ?? "")}
						onClick={closeDialog}
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
/*
 * 画像は地の上にそのまま並べる (面も枠も付けない)。タイルの角だけ丸め、指を乗せたら
 * 操作 (右上) とコピーの案内 (下) を出す。どちらも画像の上の操作なので塗らず、端から
 * 消えていく黒い影の上に白い字とアイコンを置く (denpa の docs/design.md「映像の上の操作」)。
 * 指の端末には乗せる操作が無いので、右上の操作はいつも出しておく
 */

/* ---- 一覧 ---- */
.tiles {
	display: flex;
	flex-wrap: wrap;
	gap: 0.75rem;
	/* ヘッダーとの間もタイル同士の間と同じ幅にする */
	padding-block: 0.75rem;
}
.tile {
	position: relative;
	flex-grow: 1;
	max-width: 32rem;
	height: 16rem;
	overflow: hidden;
	border-radius: var(--ui-radius-lg);
	background: var(--ui-subtle);
	/* 下からふわっと、少しずつずらして並ぶ */
	animation: ui-rise 520ms var(--ui-ease-out) both;
	animation-delay: calc(var(--i, 0) * 45ms);
}
/* 読み込み中は、地の上を光の筋が流れる (いま動いていることを示す印なので回し続ける) */
.tile::before {
	position: absolute;
	inset: 0;
	background: linear-gradient(
		100deg,
		transparent 30%,
		var(--ui-sweep) 50%,
		transparent 70%
	);
	content: "";
	animation: ui-shine 1.6s linear infinite;
	pointer-events: none;
}
.tile:has(img:global(.loaded))::before {
	display: none;
}
/* 画像そのものがボタン。ボタンらしい地・影・形は要らない */
.pic {
	--pico-background-color: transparent;
	--pico-box-shadow: none;
	display: block;
	width: 100%;
	height: 100%;
	border-radius: 0;
	padding: 0;
	cursor: pointer;
}
.pic:active {
	transform: none;
}
/* 届いたら少し縮みながら浮かび上がる。乗せるとゆっくり寄る */
.pic img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	opacity: 0;
	transform: scale(1.04);
	transition:
		opacity 360ms var(--ui-ease-out),
		transform 600ms var(--ui-ease-out);
}
.pic img:global(.loaded) {
	opacity: 1;
	transform: none;
}
@media (hover: hover) {
	.tile:hover .pic img:global(.loaded) {
		transform: scale(1.035);
	}
}
/* コピーできたら、押したところに印がぽんと出る */
.copied {
	display: flex;
	position: absolute;
	top: 50%;
	left: 50%;
	align-items: center;
	gap: 0.4rem;
	border-radius: var(--ui-radius-full);
	background: var(--ui-pop);
	box-shadow: var(--ui-shadow-pop);
	padding: 0.5rem 1rem;
	color: var(--ui-fg);
	font-size: var(--ui-text-sm);
	font-weight: 700;
	white-space: nowrap;
	pointer-events: none;
	translate: -50% -50%;
	animation:
		ui-pop 280ms var(--ui-ease-out) both,
		ui-fade 240ms var(--ui-ease) 950ms reverse forwards;
}
.copied svg {
	width: 1.125rem;
	height: 1.125rem;
	color: var(--pico-primary);
	/* 印は線を描くように現れる */
	stroke-dasharray: 24;
	animation: copied-check 360ms var(--ui-ease-out) 80ms both;
}
@keyframes copied-check {
	from {
		stroke-dashoffset: 24;
	}
	to {
		stroke-dashoffset: 0;
	}
}
.tile:has(.copied) .hint {
	opacity: 0 !important;
}/* キーボードで触っているタイルは、角に沿った外側の線 (切れないよう内側に引く) */
.pic:focus-visible {
	outline-offset: -2px;
	border-radius: var(--ui-radius-lg);
}

/* 右上の操作。裏に上から消えていく影を敷く */
.acts {
	display: flex;
	position: absolute;
	inset: 0 0 auto;
	justify-content: flex-end;
	gap: 0.125rem;
	background: linear-gradient(var(--ui-media-shade), transparent);
	padding: 0.375rem 0.375rem 1.5rem;
	pointer-events: none;
	transition: opacity var(--ui-duration) var(--ui-ease);
}
.acts > :global(*) {
	pointer-events: auto;
}
/* 画像が来るまでは影を敷かない (地の色の上に黒い帯だけが乗って見える) */
.tile:has(img:not(:global(.loaded))) .acts {
	background: none;
}
/* 下のコピーの案内。下から消えていく影の上に白い字 */
.hint {
	display: flex;
	position: absolute;
	inset: auto 0 0;
	translate: 0 0.5rem;
	align-items: center;
	justify-content: center;
	gap: 0.4rem;
	background: linear-gradient(transparent, var(--ui-media-shade));
	padding: 1.75rem 0.75rem 0.75rem;
	color: var(--ui-on-media);
	font-size: var(--ui-text-sm);
	font-weight: 700;
	text-shadow: 0 1px 2px rgb(0 0 0 / 0.6);
	opacity: 0;
	pointer-events: none;
	transition:
		opacity 200ms var(--ui-ease),
		translate 260ms var(--ui-ease-out);
}
.hint svg {
	width: 1.125rem;
	height: 1.125rem;
}
@media (hover: hover) {
	.acts {
		opacity: 0;
	}
	/* 確定待ちの削除は、指を離しても見えたままにする */
	.tile:is(:hover, :focus-within) .acts,
	.tile .acts:has(:global(.armed)),
	.tile:hover .hint {
		opacity: 1;
		translate: 0 0;
	}
}

/* 動きを減らす設定では、寄る・縮む動きも付けない (app.css が時間を 0 にする) */
@media (prefers-reduced-motion: reduce) {
	.pic img,
	.tile:hover .pic img:global(.loaded) {
		transform: none;
	}
}

/* ---- 拡大表示 ---- */
/*
 * ダイアログは操作の層 (面と影。縁は付けない)。後ろの幕はぼかさず、薄く暗くするだけ。
 * 中の操作は画像の上なので、一覧のタイルと同じ見た目
 */
dialog {
	--pico-modal-overlay-background-color: var(--ui-backdrop);
	--pico-modal-overlay-backdrop-filter: none;
	backdrop-filter: none;
}
/* 開くと幕がふわっと暗くなり、箱が少し小さいところから膨らんで出る */
dialog[open] {
	animation: ui-fade 200ms var(--ui-ease) both;
}
dialog[open] .box {
	animation: ui-pop 280ms var(--ui-ease-out) both;
}
.box {
	z-index: 1;
	position: relative;
	width: auto;
	max-width: 92vw;
	border-radius: var(--ui-radius-lg);
	background: var(--ui-surface);
	box-shadow: var(--ui-shadow-pop);
	padding: 0.5rem;
}
.shot {
	position: relative;
	overflow: hidden;
	border-radius: var(--ui-radius);
}
.shot .acts {
	opacity: 1;
}
@media (hover: hover) {
	.shot .acts {
		opacity: 0;
	}
	.shot:is(:hover, :focus-within) .acts,
	.shot .acts:has(:global(.armed)) {
		opacity: 1;
	}
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
	border-radius: var(--ui-radius);
	background: var(--ui-subtle);
}
/* 箱の外をクリックすると閉じる。全面に敷いた透明なボタンがその当たり判定 */
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
	padding: 0;
	color: transparent;
	cursor: pointer;
}
.back button:active {
	transform: none;
}
</style>