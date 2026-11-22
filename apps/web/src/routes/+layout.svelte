<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { roleAtLeast, type UserRole } from '@affiliate/shared';

  let { data, children } = $props();
  let open = $state(false);

  const nav: { href: string; label: string; role: UserRole }[] = [
    { href: '/', label: 'ภาพรวม', role: 'VIEWER' },
    { href: '/products', label: 'สินค้า', role: 'VIEWER' },
    { href: '/marketplaces', label: 'Marketplace', role: 'VIEWER' },
    { href: '/accounts', label: 'บัญชี Affiliate', role: 'VIEWER' },
    { href: '/campaigns', label: 'แคมเปญ', role: 'VIEWER' },
    { href: '/links', label: 'ลิงก์ Affiliate', role: 'VIEWER' },
    { href: '/prices', label: 'ติดตามราคา', role: 'VIEWER' },
    { href: '/sync', label: 'ซิงค์ข้อมูล', role: 'VIEWER' },
    { href: '/analytics', label: 'Analytics', role: 'VIEWER' },
    { href: '/api-keys', label: 'API Keys', role: 'ADMIN' },
    { href: '/settings', label: 'ตั้งค่าระบบ', role: 'VIEWER' }
  ];

  const active = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
</script>

<svelte:head><title>Affiliate Data Service</title></svelte:head>

{#if !data.user}
  {@render children()}
{:else}
  <div class="min-h-screen lg:flex">
    <aside
      class="fixed inset-y-0 left-0 z-30 w-64 transform border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0 {open
        ? 'translate-x-0'
        : '-translate-x-full'}"
    >
      <div class="flex h-14 items-center border-b border-slate-200 px-4 font-semibold">🛒 Affiliate Admin</div>
      <nav class="space-y-0.5 p-2">
        {#each nav.filter((n) => data.user && roleAtLeast(data.user.role, n.role)) as item (item.href)}
          <a
            href={item.href}
            onclick={() => (open = false)}
            class="block rounded-lg px-3 py-2 text-sm {active(item.href)
              ? 'bg-brand-50 font-medium text-brand-700'
              : 'text-slate-600 hover:bg-slate-50'}">{item.label}</a
          >
        {/each}
      </nav>
    </aside>
    {#if open}
      <button class="fixed inset-0 z-20 bg-black/30 lg:hidden" aria-label="Close menu" onclick={() => (open = false)}></button>
    {/if}

    <div class="min-w-0 flex-1">
      <header class="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
        <button class="btn-secondary lg:hidden" onclick={() => (open = !open)} aria-label="Toggle menu">☰</button>
        <div class="ml-auto flex items-center gap-3 text-sm">
          <span class="hidden text-slate-600 sm:inline">{data.user.name} · <span class="text-xs text-slate-400">{data.user.role}</span></span>
          <form method="POST" action="/logout"><button class="btn-secondary">ออกจากระบบ</button></form>
        </div>
      </header>
      <main class="mx-auto max-w-7xl p-4 sm:p-6">
        {@render children()}
      </main>
    </div>
  </div>
{/if}
