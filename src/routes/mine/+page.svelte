<script lang="ts">
import Gallery from "$lib/components/Gallery.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

<div class="wrap">
	{#if data.images.length === 0}
		<!-- Somebody who has just signed in is looking at the one empty space on
		     the page, which makes it the right place to say how to fill it. It
		     disappears the moment they have. -->
		<div class="muted empty">
			<p class="strong">まだ画像がありません</p>
			<p class="next">
				上の「画像を追加」から選ぶか、Tenor等の画像をこのページに直接ドラッグ&amp;ドロップしてください。
			</p>
		</div>
	{:else}
		<Gallery fileNameList={data.images} userKey={data.wkey} find={true} />
	{/if}
</div>

<style>
.wrap {
	padding-inline: 1rem;
}
.empty {
	padding-block: 2rem;
}
.strong {
	font-weight: 700;
}
.next {
	margin-top: 0.25rem;
}
</style>
