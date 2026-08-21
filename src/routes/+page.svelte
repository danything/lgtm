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
		{#if data.wkey}
			<Gallery fileNameList={data.myImages} userKey={data.wkey} find={true} />
		{:else}
			<p class="py-6 opacity-60">
				GitHubでログインすると、作った画像がここに並びます。
			</p>
		{/if}
	</div>
	<span class="tab mr-4"></span>
</div>
