<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";

  import { api, postJson } from "#lib/api.js";
  import {
    type Folder,
    FOLDER_NAME_MAX,
    type FolderFilter,
  } from "#lib/folders.js";
  import { onWindowClick } from "#lib/outside-click.js";
  import { setError, setMessage } from "#lib/stores/toast.svelte.js";

  let { folders, folder }: { folders: Folder[]; folder: FolderFilter } =
    $props();

  const current = $derived(
    typeof folder === "number"
      ? folders.find((f) => f.id === folder)
      : undefined,
  );

  // Which inline form is open, if any.
  let editing = $state<"new" | "rename">();
  let name = $state("");
  let busy = $state(false);
  // Deleting a folder is not undoable either, so it arms first.
  let armed = $state(false);

  $effect(() => {
    if (armed) return onWindowClick(() => (armed = false));
  });

  function open(mode: "new" | "rename") {
    editing = mode;
    name = mode === "rename" ? (current?.name ?? "") : "";
  }

  // Focuses the field when the form opens.
  const focus = (input: HTMLInputElement) => input.focus();

  async function run(work: () => Promise<void>) {
    busy = true;
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy = false;
    }
  }

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    return run(async () => {
      if (editing === "new") {
        const made = await postJson<Folder>("/lgtm/folders", { name });
        editing = undefined;
        setMessage(`「${made.name}」を作りました`);
        await goto(`/mine?folder=${made.id}`);
      } else if (current) {
        await postJson(`/lgtm/folders/${current.id}`, { name }, "PATCH");
        editing = undefined;
        setMessage("名前を変えました");
        await invalidateAll();
      }
    });
  };

  function remove(event: MouseEvent) {
    event.stopPropagation();
    if (!armed) {
      armed = true;
      return;
    }
    armed = false;
    const target = current;
    if (!target) return;
    return run(async () => {
      await api(`/lgtm/folders/${target.id}`, { method: "DELETE" });
      setMessage(`「${target.name}」を削除しました`);
      await goto("/mine");
    });
  }
</script>

<nav class="bar" aria-label="フォルダ">
  <a class="chip" class:on={folder === undefined} href="/mine">すべて</a>
  <a class="chip" class:on={folder === "none"} href="/mine?folder=none"
    >未分類</a
  >
  {#each folders as f (f.id)}
    <a class="chip" class:on={folder === f.id} href={`/mine?folder=${f.id}`}>
      {f.name}<span class="count">{f.images}</span>
    </a>
  {/each}
  {#if editing === "new"}
    {@render form("フォルダの名前", "作る")}
  {:else}
    <button type="button" class="ghost xs" onclick={() => open("new")}>
      ＋ フォルダ
    </button>
  {/if}
</nav>

{#if current}
  <div class="tools">
    {#if editing === "rename"}
      {@render form("新しい名前", "変える")}
    {:else}
      <button type="button" class="ghost xs" onclick={() => open("rename")}>
        名前を変える
      </button>
      <button
        type="button"
        class="outline danger xs"
        class:armed
        disabled={busy}
        onclick={remove}
      >
        {armed ? "もう一度押すと削除" : "フォルダを削除"}
      </button>
      {#if armed}
        <span class="muted small">中の画像は消えず、未分類に戻ります</span>
      {/if}
    {/if}
  </div>
{/if}

{#snippet form(label: string, action: string)}
  <form class="edit" onsubmit={submit}>
    <input
      aria-label={label}
      placeholder={label}
      maxlength={FOLDER_NAME_MAX}
      required
      bind:value={name}
      {@attach focus}
      onkeydown={(e) => e.key === "Escape" && (editing = undefined)}
    />
    <button type="submit" class="xs" disabled={busy}>{action}</button>
    <button type="button" class="ghost xs" onclick={() => (editing = undefined)}
      >やめる</button
    >
  </form>
{/snippet}

<style>
  /* 選んでいるフォルダは、ヘッダーのタブと同じく下線と主の色の太字 */
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    padding-top: 0.75rem;
  }
  .chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    height: 2.25rem;
    border-radius: var(--ui-radius-full);
    padding-inline: 0.75rem;
    color: var(--ui-fg);
    font-size: var(--ui-text-sm);
    text-decoration: none;
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
  .tools,
  .edit {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
  }
  .tools {
    padding-top: 0.25rem;
  }
  input {
    width: 14rem;
    max-width: 100%;
    height: var(--ui-btn-h-xs);
    border: 1px solid var(--ui-line);
    border-radius: var(--ui-radius);
    background: var(--ui-bg);
    padding-inline: 0.625rem;
    color: var(--ui-fg);
    font-size: var(--ui-text-sm);
  }
</style>
