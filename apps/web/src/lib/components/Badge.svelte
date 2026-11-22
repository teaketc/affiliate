<script lang="ts">
  let { value }: { value: string } = $props();

  const tone: Record<string, string> = {
    SHOPEE: 'bg-orange-100 text-orange-800',
    LAZADA: 'bg-indigo-100 text-indigo-800',
    ACTIVE: 'bg-emerald-100 text-emerald-800',
    SUCCESS: 'bg-emerald-100 text-emerald-800',
    RUNNING: 'bg-sky-100 text-sky-800',
    QUEUED: 'bg-slate-100 text-slate-700',
    DRAFT: 'bg-slate-100 text-slate-700',
    PAUSED: 'bg-amber-100 text-amber-800',
    FAILED: 'bg-red-100 text-red-800',
    ERROR: 'bg-red-100 text-red-800',
    DISABLED: 'bg-slate-200 text-slate-600',
    CANCELLED: 'bg-slate-200 text-slate-600',
    ENDED: 'bg-slate-200 text-slate-600'
  };
</script>

<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {tone[value] ?? 'bg-slate-100 text-slate-700'}">
  {value}
</span>
