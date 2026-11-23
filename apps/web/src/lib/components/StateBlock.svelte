<script lang="ts">
	import Spinner from './Spinner.svelte';
	let {
		kind,
		title,
		message = '',
		onretry
	}: { kind: 'loading' | 'empty' | 'error'; title: string; message?: string; onretry?: () => void } = $props();
</script>

<div class="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
	{#if kind === 'loading'}
		<Spinner size="h-7 w-7" />
	{:else if kind === 'empty'}
		<div class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl" aria-hidden="true">📦</div>
	{:else}
		<div class="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-2xl" aria-hidden="true">⚠️</div>
	{/if}
	<p class="font-medium text-slate-800">{title}</p>
	{#if message}<p class="max-w-md text-sm text-slate-500">{message}</p>{/if}
	{#if onretry}<button class="btn-secondary mt-2" onclick={onretry}>ลองอีกครั้ง</button>{/if}
</div>
