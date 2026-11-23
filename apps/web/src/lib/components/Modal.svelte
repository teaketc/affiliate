<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, onclose, children, footer }: { title: string; onclose: () => void; children: Snippet; footer?: Snippet } = $props();

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window {onkeydown} />

<div class="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
	<button class="absolute inset-0 cursor-default" aria-label="Close dialog" onclick={onclose}></button>
	<div class="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-label={title}>
		<header class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
			<h2 class="text-base font-semibold">{title}</h2>
			<button class="text-slate-400 hover:text-slate-700" onclick={onclose} aria-label="Close">✕</button>
		</header>
		<div class="overflow-y-auto px-5 py-4">{@render children()}</div>
		{#if footer}<footer class="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{@render footer()}</footer>{/if}
	</div>
</div>
