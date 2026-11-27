<script lang="ts">
  import Gallery from "#lib/components/Gallery.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<!-- 本人にしか中身がないので、検索に出さない -->
<svelte:head>
  <title>自分の画像｜LGTM</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="wrap">
  {#if data.images.length === 0}
    <!-- The one empty space a new account sees, so say how to fill it. -->
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
    animation: ui-rise 480ms var(--ui-ease-out) both;
  }
  .strong {
    font-weight: 700;
  }
  .next {
    margin-top: 0.25rem;
  }
</style>
