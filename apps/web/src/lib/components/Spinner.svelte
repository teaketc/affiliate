<script lang="ts">
	let { size = 'h-4 w-4', label = 'Loading' }: { size?: string; label?: string } = $props();
</script>

<svg class="{size} animate-spin" viewBox="0 0 24 24" fill="none" role="status" aria-label={label}>
	<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
	<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
</svg>
