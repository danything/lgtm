<script lang="ts">
  import type { GroupKey, GroupSection } from "#lib/groups.js";

  let {
    groups,
    group,
  }: { groups: GroupSection[]; group: GroupKey | "new" | undefined } = $props();
</script>

<!-- フォルダの帯と同じ形。狭い画面では折り返さず横に流す -->
<nav class="bar" aria-label="グループ">
  <a class="chip" class:on={group === undefined} href="/">グループ別</a>
  <a class="chip" class:on={group === "new"} href="/?group=new">新着</a>
  {#each groups as g (g.key)}
    <a class="chip" class:on={group === g.key} href={`/?group=${g.key}`}>
      {g.label}<span class="count">{g.count}</span>
    </a>
  {/each}
</nav>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    overflow-x: auto;
    scrollbar-width: none;
    padding-top: 0.75rem;
  }
  .chip {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.375rem;
    height: 2.25rem;
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
    bottom: 0.2rem;
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
