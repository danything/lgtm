<script lang="ts">
import ErrorAlert from "$lib/components/ErrorAlert.svelte";
import Gallery from "$lib/components/Gallery.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

{#if data.message !== undefined}
	<div class="px-4"><ErrorAlert>{data.message}</ErrorAlert></div>
{/if}

<!-- px-4 to match the header: one margin down the whole page, rather than a
     narrow column of prose sitting over a full-bleed gallery. -->
<div role="tablist" class="tabs tabs-border tabs-xl mb-3 px-4">
	<input
		type="radio"
		name="my_tabs_1"
		role="tab"
		class="tab"
		aria-label="新着"
		checked
	/>
	<div role="tabpanel" class="tab-content">
		<Gallery fileNameList={data.recentImages} userKey={data.wkey} find={false} />
	</div>

	<input type="radio" name="my_tabs_1" role="tab" class="tab" aria-label="自分" />
	<div role="tabpanel" class="tab-content">
		{#if !data.wkey}
			<p class="py-6 opacity-60">
				GitHubでログインすると、作った画像がここに並びます。
			</p>
		{:else if data.myImages.length === 0}
			<!-- Somebody who has just signed in is looking at the one empty space
			     on the page, which makes it the right place to say how to fill it.
			     It disappears the moment they have. -->
			<div class="py-8 opacity-60">
				<p class="font-bold">まだ画像がありません</p>
				<p class="mt-1">
					上の「画像を追加」から選ぶか、Tenor等の画像をこのページに直接ドラッグ&amp;ドロップしてください。
				</p>
			</div>
		{:else}
			<Gallery fileNameList={data.myImages} userKey={data.wkey} find={true} />
		{/if}
	</div>
	<span class="tab mr-4"></span>
</div>
