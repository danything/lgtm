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

<!-- ヘッダーと同じ浮いた面。ヘッダーの下に貼り付いて残る -->
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
  /*
   * ヘッダーと同じ浮いた面 (形と色は +layout.svelte の変数)。ヘッダーの下に
   * 同じ隙間を空けて貼り付く。左右は親の余白を戻してヘッダーの端にそろえる
   */
  .sticky {
    position: sticky;
    z-index: 30;
    top: calc(var(--ui-header-bottom) + var(--ui-header-top));
    margin-top: var(--ui-header-top);
    margin-inline: calc(var(--ui-header-inset) - var(--wrap-pad));
    border-radius: var(--ui-header-radius);
    background: var(--ui-float);
    box-shadow: var(--ui-shadow-pop);
    padding: 0.375rem;
    transition:
      background-color 240ms var(--ui-ease),
      box-shadow 240ms var(--ui-ease);
  }
  /* ヘッダーと同じく、一番上では平らで、巻き始めに面と影が付く */
  @supports (animation-timeline: scroll()) {
    @media (prefers-reduced-motion: no-preference) {
      .sticky {
        background-color: transparent;
        box-shadow: none;
        animation: ui-lift linear both;
        animation-timeline: scroll(root);
        animation-range: 0 3rem;
      }
    }
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
    padding-inline: 0.875rem;
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
  /* ヘッダーのタブと同じ印。線は押す範囲の内側に引き、真ん中から伸びる */
  .chip.on::after {
    position: absolute;
    inset-inline: 0.875rem;
    bottom: 0.3rem;
    height: 2px;
    border-radius: 1px;
    background: var(--pico-primary);
    content: "";
    animation: ui-grow 260ms var(--ui-ease-out) both;
  }
  .count {
    color: var(--ui-muted);
    font-size: var(--ui-text-xs);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
</style>
