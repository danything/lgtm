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

<!-- 左右の余白。狭い画面では詰める -->
<div class="wrap">
  <GroupBar
    groups={data.groups}
    group={data.group}
    scenes={data.scenes}
    scene={data.scene}
  />
  <!-- 帯の上は帯が塗るので、知らせは帯の下に置く -->
  {#if data.message !== undefined}
    <ErrorAlert>{data.message}</ErrorAlert>
  {/if}
  {#if data.rows.length > 0}
    <!-- 中身で分けた段。上げたばかりの画像はグループが付く前なので、新着を先に置く -->
    {#each data.rows as r (r.key)}
      <section aria-labelledby={`g-${r.key}`}>
        <div class="head">
          <h2 id={`g-${r.key}`}>
            {r.label}{#if r.count !== undefined}<span class="count"
                >{r.count}</span
              >{/if}
          </h2>
          <a class="more" href={r.more}>もっと見る</a>
        </div>
        <Gallery
          fileNameList={r.images}
          userKey={data.wkey}
          find={false}
          strip
        />
      </section>
    {/each}
  {:else}
    {#key `${data.group}/${data.scene}`}
      <Gallery
        fileNameList={data.images}
        userKey={data.wkey}
        find={false}
        group={data.group === "all" ? undefined : data.group}
        scene={data.scene}
      />
    {/key}
  {/if}
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
  /* 帯 (GroupBar) も同じ幅だけ横にはみ出して塗る */
  .wrap {
    --wrap-pad: 0.75rem;
    padding-inline: var(--wrap-pad);
  }
  @media (min-width: 640px) {
    .wrap {
      --wrap-pad: 1rem;
    }
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
    font-size: 1rem;
  }
  .count {
    color: var(--ui-muted);
    font-size: var(--ui-text-sm);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  /* 押せる高さは 44px。見出しの行の高さもこれで決まる */
  .more {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    font-size: var(--ui-text-sm);
    white-space: nowrap;
  }
</style>
