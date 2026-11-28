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
        <!-- 下にあるサブジャンル (人の場面)。見出しのすぐ下に並べて、あると分かるようにする -->
        {#if r.subs.length > 0}
          <nav class="subs" aria-label={`${r.label}の場面`}>
            {#each r.subs as s (s.key)}
              <a class="sub" href={`/?group=${r.key}&scene=${s.key}`}
                ><span class="pill"
                  >{s.label}<span class="count">{s.count}</span></span
                ></a
              >
            {/each}
          </nav>
        {/if}
        <Gallery
          fileNameList={r.images}
          userKey={data.wkey}
          find={false}
          group={r.filter.group}
          scene={r.filter.scene}
          more={r.more}
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
  /*
   * サブジャンル (人の場面) への入口。帯 (GroupBar) の項目と違い、ここは段の
   * 見出しに添えるので、押せると分かる淡い地のカプセルにする。押せる高さは
   * 44px のまま、見えるカプセルは 2rem。狭い画面では折り返さず、段と同じく
   * 画面の端まで横に流す
   */
  .subs {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin: -0.5rem calc(-1 * var(--wrap-pad)) 0;
    overflow-x: auto;
    scrollbar-width: none;
    padding-inline: var(--wrap-pad);
  }
  .sub {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    height: 2.75rem;
    color: var(--ui-fg);
    font-size: var(--ui-text-sm);
    text-decoration: none;
    white-space: nowrap;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    height: 2rem;
    border-radius: var(--ui-radius-full);
    background: var(--ui-subtle);
    padding-inline: 0.75rem;
    transition: background-color var(--ui-duration) var(--ui-ease);
  }
  .sub:hover .pill {
    background: var(--ui-line);
  }
  /* 焦点の線は見えるカプセルに沿わせる */
  .sub:focus-visible {
    outline: none;
  }
  .sub:focus-visible .pill {
    outline: 2px solid var(--pico-primary);
    outline-offset: 2px;
  }
  .pill .count {
    font-size: var(--ui-text-xs);
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
