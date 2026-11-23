<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import Toasts from '$lib/components/Toasts.svelte';

	let { children } = $props();
	let menuOpen = $state(false);

	const nav = [
		{ href: '/', label: 'Dashboard', icon: '📊' },
		{ href: '/extract', label: 'Extract Product', icon: '🔗' },
		{ href: '/products', label: 'Products', icon: '📦' },
		{ href: '/history', label: 'Extraction History', icon: '🕘' }
	];
	const isActive = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
	const current = $derived(nav.find((n) => isActive(n.href))?.label ?? '');
</script>

<div class="min-h-screen md:flex">
	<aside class="sticky top-0 z-30 border-b border-slate-200 bg-white md:h-screen md:w-64 md:shrink-0 md:border-r md:border-b-0">
		<div class="flex items-center justify-between px-4 py-3 md:py-5">
			<a href="/" class="flex items-center gap-2 font-semibold">
				<img src="/favicon.svg" alt="" class="h-8 w-8" />
				<span>Affiliate Extractor</span>
			</a>
			<button class="btn-secondary px-3 py-1.5 md:hidden" onclick={() => (menuOpen = !menuOpen)} aria-expanded={menuOpen} aria-controls="main-nav">☰</button>
		</div>
		<nav id="main-nav" class="{menuOpen ? 'block' : 'hidden'} px-3 pb-3 md:block">
			{#each nav as item}
				<a
					href={item.href}
					onclick={() => (menuOpen = false)}
					class="mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium {isActive(item.href) ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}"
					aria-current={isActive(item.href) ? 'page' : undefined}
				>
					<span aria-hidden="true">{item.icon}</span>{item.label}
				</a>
			{/each}
		</nav>
	</aside>

	<main class="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10">
		<h1 class="mb-6 text-xl font-semibold tracking-tight sm:text-2xl">{current}</h1>
		{@render children()}
	</main>
</div>

<Toasts />
