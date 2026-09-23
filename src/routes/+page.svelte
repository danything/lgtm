<script lang="ts">
import { page } from "$app/state";
import ErrorAlert from "$lib/components/ErrorAlert.svelte";
import Gallery from "$lib/components/Gallery.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

const title = "LGTM画像ジェネレーター｜GIF対応・Markdownをワンクリックでコピー";
const description =
	"画像やGIFをドラッグ&ドロップするだけでLGTM画像を作成。アニメーションもそのまま残ります。みんなが作ったLGTM画像はクリックひとつでMarkdownをコピーでき、GitHubのプルリクエストのレビューにすぐ貼れます。";
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={`${page.url.origin}/`} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={`${page.url.origin}/`} />
	<!-- 検索結果にサイト名とアプリの種類を出してもらうための構造化データ -->
	{@html `<script type="application/ld+json">${JSON.stringify({
		"@context": "https://schema.org",
		"@type": "WebApplication",
		name: "LGTM",
		alternateName: "LGTM画像ジェネレーター",
		url: `${page.url.origin}/`,
		description,
		applicationCategory: "DeveloperApplication",
		operatingSystem: "Any",
		inLanguage: "ja",
		offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
	})}</script>`}
</svelte:head>

<!-- 画面には一覧しかなく、検索エンジンと読み上げには何のページか伝わらない。
     見出しだけは文字で置いておく(見た目は一覧のまま)。 -->
<h1 class="visually-hidden">LGTM画像ジェネレーター・LGTM画像一覧</h1>

{#if data.message !== undefined}
	<div class="wrap"><ErrorAlert>{data.message}</ErrorAlert></div>
{/if}

<!-- 左右の余白はヘッダーと同じ 1rem: ページ全体で一本の余白にする。 -->
<div class="wrap">
	<Gallery fileNameList={data.images} userKey={data.wkey} find={false} />
</div>

<style>
.visually-hidden {
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
}
.wrap {
	padding-inline: 1rem;
}
</style>
