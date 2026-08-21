<script lang="ts">
let { onOpen }: { onOpen: () => void } = $props();

function onClick(e: MouseEvent) {
	// The tile underneath copies the link; this is the other thing you might
	// have wanted, so it must not also do that.
	e.stopPropagation();
	onOpen();
}
</script>

<button
	type="button"
	aria-label="拡大して表示"
	class="btn btn-square btn-primary"
	onclick={onClick}
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		class="h-6 w-6"
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
	>
		<title>Preview</title>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="2"
			d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
		/>
	</svg>
</button>
