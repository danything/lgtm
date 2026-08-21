<script lang="ts">
import ErrorAlert from "$lib/components/ErrorAlert.svelte";
import Gallery from "$lib/components/Gallery.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

{#if data.message !== undefined}
	<div class="px-4"><ErrorAlert>{data.message}</ErrorAlert></div>
{/if}

<!-- px-4 to match the header: one margin down the whole page. -->
<div class="px-4">
	<Gallery fileNameList={data.images} userKey={data.wkey} find={false} />
</div>
