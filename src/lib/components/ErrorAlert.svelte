<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div role="alert" class="note err">
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <title>Danger</title>
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
  <span>{@render children()}</span>
</div>

<style>
  /* 注意書きの面 (app.css の .note)。問題であることは赤い印と言葉で示し、地は塗らない */
  .note {
    margin-top: 0.75rem;
  }
  svg {
    flex-shrink: 0;
    width: 1.375rem;
    height: 1.375rem;
  }
</style>
