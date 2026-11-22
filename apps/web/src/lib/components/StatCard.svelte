<script lang="ts">
  let { label, value, hint }: { label: string; value: string | number; hint?: string } = $props();
</script>

<div class="card">
  <p class="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
  <p class="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
  {#if hint}<p class="mt-1 text-xs text-slate-500">{hint}</p>{/if}
</div>
