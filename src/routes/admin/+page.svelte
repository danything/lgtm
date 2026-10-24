<script lang="ts">
import { setMessage } from "#lib/stores/toast.svelte.js";
import { refreshAll } from "$app/navigation";
import type { PageProps } from "./$types";
import "@anyblades/blades/layered/content/table";

let { data }: PageProps = $props();

let saving = $state<string>();
// Deleting an account cannot be undone and takes its images with it, so the
// first click only arms the button; any other click puts it back.
let armed = $state<string>();

$effect(() => {
	if (armed === undefined) return;
	const disarm = () => {
		armed = undefined;
	};
	window.addEventListener("click", disarm);
	return () => window.removeEventListener("click", disarm);
});

async function send(
	userKey: string,
	init: RequestInit,
	ok: (result: { images?: number }) => string,
) {
	try {
		saving = userKey;
		const res = await fetch("/api/admin", {
			headers: { "Content-Type": "application/json" },
			...init,
		});
		const ret = await res.json();
		if (!res.ok || ret.error)
			throw new Error(ret.error ?? "変更できませんでした");
		setMessage(ok(ret));
	} catch (error) {
		setMessage(error instanceof Error ? error.message : "変更できませんでした");
	} finally {
		await refreshAll();
		saving = undefined;
	}
}

const setAdmin = (userKey: string, admin: boolean) =>
	send(
		userKey,
		{ method: "POST", body: JSON.stringify({ userKey, admin }) },
		() => (admin ? "管理者にしました" : "管理者を解除しました"),
	);

function remove(event: MouseEvent, user: { userKey: string; images: number }) {
	event.stopPropagation();
	if (armed !== user.userKey) {
		armed = user.userKey;
		return;
	}
	armed = undefined;
	send(
		user.userKey,
		{ method: "DELETE", body: JSON.stringify({ userKey: user.userKey }) },
		(ret) => `削除しました (画像 ${ret.images}件)`,
	);
}

const number = new Intl.NumberFormat("ja-JP");
// JST explicitly, so the server's UTC render and the browser's do not disagree
// and swap on hydration. The daily rows beside it are JST too.
const dateTime = new Intl.DateTimeFormat("ja-JP", {
	dateStyle: "short",
	timeStyle: "short",
	timeZone: "Asia/Tokyo",
});
</script>

<svelte:head>
	<title>管理｜LGTM</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<div class="counts">
		<div class="count item">
			<div class="lab">画像</div>
			<div class="val">{number.format(data.lgtm.images)}</div>
		</div>
		<div class="count item">
			<div class="lab">アップロードした人</div>
			<div class="val">{number.format(data.lgtm.owners)}</div>
		</div>
		<div class="count item">
			<div class="lab">GitHubアカウント</div>
			<div class="val">{number.format(data.lgtm.githubUsers)}</div>
		</div>
	</div>

	<h2 class="heading">ユーザー別</h2>
	<div class="scroll-x">
		<table>
			<thead>
				<tr>
					<th scope="col">GitHub</th>
					<th scope="col">key</th>
					<th scope="col">画像</th>
					<th scope="col">最終</th>
				</tr>
			</thead>
			<tbody>
				{#each data.lgtm.uploaders as row (row.userKey)}
					<tr>
						<td>{row.login ?? "-"}</td>
						<td class="mono muted">{row.userKey}…</td>
						<td>{number.format(row.images)}</td>
						<td>{dateTime.format(row.latest)}</td>
					</tr>
				{:else}
					<tr><td colspan="4">まだ画像がありません</td></tr>
				{/each}
			</tbody>
		</table>
	</div>

	<h2 class="heading">日別 (直近30日)</h2>
	<div class="scroll-x">
		<table>
			<thead>
				<tr>
					<th scope="col">日付</th>
					<th scope="col">画像</th>
				</tr>
			</thead>
			<tbody>
				{#each data.lgtm.days as day (day.date)}
					<tr>
						<td>{day.date}</td>
						<td>{number.format(day.images)}</td>
					</tr>
				{:else}
					<tr><td colspan="2">まだ画像がありません</td></tr>
				{/each}
			</tbody>
		</table>
	</div>

	<h2 class="heading">ユーザーと権限</h2>
	<div class="scroll-x">
		<table>
			<thead>
				<tr>
					<th scope="col">GitHub</th>
					<th scope="col">key</th>
					<th scope="col">画像</th>
					<th scope="col">管理者</th>
					<th scope="col"></th>
				</tr>
			</thead>
			<tbody>
				{#each data.users as user (user.userKey)}
					<tr>
						<td>{user.login ?? "-"}</td>
						<td class="mono muted">{user.userKey.slice(0, 8)}…</td>
						<td>{number.format(user.images)}</td>
						<td>
							{#if user.fixed}
								<!-- Named in the environment, so the app has no say in it. -->
								<span class="tag">環境変数</span>
							{:else if user.login}
								<button
									type="button"
									class="xs"
									class:outline={user.admin}
									class:danger={user.admin}
									disabled={saving !== undefined}
									onclick={() => setAdmin(user.userKey, !user.admin)}
								>
									{#if saving === user.userKey}
										<span class="spin"></span>
									{/if}
									{user.admin ? "解除" : "付与"}
								</button>
							{:else}
								<!-- Owns pictures but has never signed in here: an account
								     from before the x.com sign-in was retired. -->
								<span class="tag">ログインなし</span>
							{/if}
						</td>
						<td>
							{#if !user.fixed}
								<button
									type="button"
									class="xs danger"
									class:outline={armed !== user.userKey}
									disabled={saving !== undefined}
									onclick={(event) => remove(event, user)}
								>
									{#if saving === user.userKey}
										<span class="spin"></span>
									{/if}
									{armed === user.userKey
										? `画像${user.images}件ごと削除`
										: "削除"}
								</button>
							{/if}
						</td>
					</tr>
				{:else}
					<tr><td colspan="5">まだユーザーがいません</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
.page {
	padding-block: 0.75rem 2rem;
}

/* ---- 件数。1 つずつ件の面に乗せ、線では分けない ---- */
.counts {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
	gap: 0.5rem;
	margin-bottom: 1.5rem;
}
.count {
	padding: 1rem 1.25rem;
	animation: ui-rise 480ms var(--ui-ease-out) both;
}
.count:nth-child(2) {
	animation-delay: 60ms;
}
.count:nth-child(3) {
	animation-delay: 120ms;
}
.lab {
	color: var(--ui-muted);
	font-size: var(--ui-text-xs);
}
.val {
	font-size: 2rem;
	font-weight: 700;
	line-height: 1.2;
	font-variant-numeric: tabular-nums;
}

/* まとまりは線ではなく余白と見出しで分ける */
.heading {
	margin: 1.5rem 0 0.25rem;
	padding-inline: 0.75rem;
	font-size: var(--ui-text-sm);
}
</style>