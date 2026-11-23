<script lang="ts">
	let { src, alt, size = 'h-12 w-12' }: { src: string | null; alt: string; size?: string } = $props();
	let broken = $state(false);
</script>

{#if src && !broken}
	<img {src} {alt} class="{size} shrink-0 rounded-lg border border-slate-200 bg-slate-100 object-cover" loading="lazy" referrerpolicy="no-referrer" onerror={() => (broken = true)} />
{:else}
	<div class="{size} flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400" aria-label="No image">🖼️</div>
{/if}
