<script lang="ts">
  import { page } from "$app/state";

  import ErrorAlert from "#lib/components/ErrorAlert.svelte";
  import Gallery from "#lib/components/Gallery.svelte";
  import GroupBar from "#lib/components/GroupBar.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const title =
    "LGTM画像ジェネレーター｜GIF対応・ワンクリックでコピーしてGitHubに貼れる";
  const description =
    "画像やGIFをドラッグ&ドロップするだけでLGTM画像を作成。アニメーションもそのまま残ります。みんなが作ったLGTM画像はクリックひとつで貼り付け用の画像タグをコピーでき、GitHubのプルリクエストのレビューにそのまま貼れます。";
  // markup に `<script` があると oxlint が読めないので、ここで文字列にして @html で置く
  const jsonLd = $derived(
    `<script type="application/ld+json">${JSON.stringify({
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
    })}${"<"}/script>`,
  );
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={`${page.url.origin}/`} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={`${page.url.origin}/`} />
  <!-- 検索結果にサイト名とアプリの種類を出してもらうための構造化データ -->
  {@html jsonLd}
</svelte:head>

<!-- 一覧だけでは何のページか伝わらないので、見出しを隠して置く -->
<h1 class="visually-hidden">LGTM画像ジェネレーター・LGTM画像一覧</h1>

{#if data.message !== undefined}
  <div class="wrap"><ErrorAlert>{data.message}</ErrorAlert></div>
{/if}

<!-- 左右の余白はヘッダーと同じ 1rem -->
<div class="wrap">
  <GroupBar groups={data.groups} group={data.group} />
  {#if data.group !== undefined}
    {#key data.group}
      <Gallery
        fileNameList={data.images}
        userKey={data.wkey}
        find={false}
        group={data.group === "new" ? undefined : data.group}
      />
    {/key}
  {:else}
    <!-- 中身で分けた段。上げたばかりの画像はグループが付く前なので、新着を先に置く -->
    {@render row("new", "新着", undefined, data.images)}
    {#each data.sections as s (s.key)}
      {@render row(s.key, s.label, s.count, s.images)}
    {/each}
  {/if}
</div>

{#snippet row(
  key: string,
  label: string,
  count: number | undefined,
  images: typeof data.images,
)}
  <section aria-labelledby={`g-${key}`}>
    <div class="head">
      <h2 id={`g-${key}`}>
        {label}{#if count !== undefined}<span class="count">{count}</span>{/if}
      </h2>
      <a class="more" href={`/?group=${key}`}>もっと見る</a>
    </div>
    <Gallery fileNameList={images} userKey={data.wkey} find={false} strip />
  </section>
{/snippet}

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
  section {
    padding-top: 1rem;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }
  h2 {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin: 0;
    font-size: 1.125rem;
  }
  .count {
    color: var(--ui-muted);
    font-size: var(--ui-text-sm);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  .more {
    font-size: var(--ui-text-sm);
    white-space: nowrap;
  }
</style>
