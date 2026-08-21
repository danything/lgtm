<script lang="ts">
import ErrorAlert from "$lib/components/ErrorAlert.svelte";
import type { File as GalleryFile } from "$lib/components/Gallery.svelte";
import Gallery from "$lib/components/Gallery.svelte";
import SignInButton from "$lib/components/SignInButton.svelte";
import Upload from "$lib/components/Upload.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

<div class="prose mx-auto p-4">
	<p>
		LGTM画像が生成できます
		<br />
		Tenor等から直接ドラッグアンドドロップでも登録できます
	</p>
	{#if data.message !== undefined}
		<ErrorAlert>{data.message}</ErrorAlert>
	{/if}
	{#if data.ghLogin && data.wkey}
		<Upload />
		<p class="text-sm opacity-60">ログイン中: GitHub ({data.ghLogin})</p>
	{:else}
		<p>作成機能を利用するにはログインしてください</p>
		<div class="not-prose">
			<SignInButton />
		</div>
	{/if}
</div>
<div role="tablist" class="tabs tabs-border tabs-xl mb-3">
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
			<p>作成機能を利用するにはログインしてください</p>
		{/if}
	</div>
	<span class="tab mr-4"></span>
</div>
