<script lang="ts">
  import FolderBar from "#lib/components/FolderBar.svelte";
  import Gallery from "#lib/components/Gallery.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  // Counts follow moves here, without reloading the list being scrolled.
  let folders = $derived(data.folders);

  function moved(from: number | null, to: number | null) {
    folders = folders.map((f) => ({
      ...f,
      images: f.images + (f.id === to ? 1 : 0) - (f.id === from ? 1 : 0),
    }));
  }
</script>

<!-- 本人にしか中身がないので、検索に出さない -->
<svelte:head>
  <title>自分の画像｜LGTM</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="wrap">
  <FolderBar {folders} folder={data.folder} />
  <!-- Gallery shows it, so moving or deleting the last tile still explains the space. -->
  <Gallery
    fileNameList={data.images}
    userKey={data.wkey}
    find={true}
    {folders}
    folder={data.folder}
    onMoved={moved}
  >
    {#snippet empty()}
      <div class="muted empty">
        {#if data.folder === undefined}
          <!-- The one empty space a new account sees, so say how to fill it. -->
          <p class="strong">まだ画像がありません</p>
          <p class="next">
            上の「画像を追加」から選ぶか、Tenor等の画像をこのページに直接ドラッグ&amp;ドロップしてください。
          </p>
        {:else}
          <p class="strong">このフォルダには画像がありません</p>
          <p class="next">
            {data.folder === "none"
              ? "どのフォルダにも入っていない画像がここに出ます。"
              : "このフォルダを開いたまま画像を追加すると、ここに入ります。ほかの画像は、画像の右上のフォルダの印から移せます。"}
          </p>
        {/if}
      </div>
    {/snippet}
  </Gallery>
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
