<script lang="ts">
  import type {
    GroupKey,
    GroupSection,
    SceneKey,
    SceneSection,
  } from "#lib/groups.js";

  let {
    groups,
    group,
    scenes = [],
    scene,
  }: {
    groups: GroupSection[];
    group: GroupKey | "all" | undefined;
    /** 人's scenes, shown as a second row while 人 is open. */
    scenes?: SceneSection[];
    scene?: SceneKey;
  } = $props();
</script>

<!-- ヘッダーの下に貼り付いて残る。下の画像が透けないよう地の色で塗る -->
<div class="sticky">
  <nav class="bar" aria-label="グループ">
    <a class="chip" class:on={group === undefined} href="/">グループ別</a>
    <a class="chip" class:on={group === "all"} href="/?group=all">すべて</a>
    {#each groups as g (g.key)}
      <a class="chip" class:on={group === g.key} href={`/?group=${g.key}`}>
        {g.label}<span class="count">{g.count}</span>
      </a>
    {/each}
  </nav>
  {#if group === "person" && scenes.length > 0}
    <nav class="bar sub" aria-label="人の場面">
      <a class="chip" class:on={scene === undefined} href="/?group=person"
        >場面別</a
      >
      {#each scenes as s (s.key)}
        <a
          class="chip"
          class:on={scene === s.key}
          href={`/?group=person&scene=${s.key}`}
        >
          {s.label}<span class="count">{s.count}</span>
        </a>
      {/each}
    </nav>
  {/if}
</div>

<style>
  /* 横の余白まで塗るため、親の余白の分だけはみ出す */
  .sticky {
    position: sticky;
    z-index: 30;
    top: var(--ui-header-bottom);
    margin-inline: calc(-1 * var(--wrap-pad));
    background: var(--ui-bg);
    padding-inline: var(--wrap-pad);
  }
  /* ヘッダーのまわり (帯より上) も塗り、巻いた画像を見せない */
  .sticky::before {
    position: absolute;
    inset-inline: 0;
    bottom: 100%;
    height: var(--ui-header-bottom);
    background: var(--ui-bg);
    content: "";
  }
  /* 狭い画面では折り返さず横に流す */
  .bar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .sub {
    border-top: 1px solid var(--ui-line);
  }
  /* 押せる高さは 44px (2.75rem) */
  .chip {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.375rem;
    height: 2.75rem;
    border-radius: var(--ui-radius-full);
    padding-inline: 0.75rem;
    color: var(--ui-fg);
    font-size: var(--ui-text-sm);
    text-decoration: none;
    white-space: nowrap;
    transition: background-color var(--ui-duration) var(--ui-ease);
  }
  .chip:hover {
    background: var(--ui-hover-soft);
  }
  .chip.on {
    color: var(--ui-primary-text);
    font-weight: 700;
  }
  .chip.on::after {
    position: absolute;
    inset-inline: 0.75rem;
    bottom: 0.4rem;
    height: 2px;
    border-radius: 1px;
    background: var(--pico-primary);
    content: "";
  }
  .count {
    color: var(--ui-muted);
    font-size: var(--ui-text-xs);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
</style>
