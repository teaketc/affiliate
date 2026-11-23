<script lang="ts">
	import { dismiss, toasts } from '$lib/toast.svelte';
	const tone = {
		success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
		error: 'border-rose-200 bg-rose-50 text-rose-900',
		warning: 'border-amber-200 bg-amber-50 text-amber-900',
		info: 'border-slate-200 bg-white text-slate-900'
	};
</script>

<div class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end" aria-live="polite">
	{#each toasts as t (t.id)}
		<div class="pointer-events-auto w-full max-w-sm rounded-lg border p-4 shadow-lg {tone[t.kind]}" role="status">
			<div class="flex items-start gap-3">
				<div class="flex-1">
					<p class="text-sm font-semibold">{t.title}</p>
					{#if t.message}<p class="mt-0.5 text-sm break-words opacity-80">{t.message}</p>{/if}
				</div>
				<button class="text-sm opacity-60 hover:opacity-100" onclick={() => dismiss(t.id)} aria-label="Dismiss">✕</button>
			</div>
		</div>
	{/each}
</div>
