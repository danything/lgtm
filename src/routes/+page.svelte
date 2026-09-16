<script lang="ts">
import ErrorAlert from "$lib/components/ErrorAlert.svelte";
import Gallery from "$lib/components/Gallery.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

{#if data.message !== undefined}
	<div class="wrap"><ErrorAlert>{data.message}</ErrorAlert></div>
{/if}

<!-- 左右の余白はヘッダーと同じ 1rem: ページ全体で一本の余白にする。 -->
<div class="wrap">
	<Gallery fileNameList={data.images} userKey={data.wkey} find={false} />
</div>

<style>
.wrap {
	padding-inline: 1rem;
}
</style>
