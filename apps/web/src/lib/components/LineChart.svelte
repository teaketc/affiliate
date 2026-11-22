<script lang="ts">
  /** Dependency-free responsive SVG line chart. */
  let {
    points,
    height = 180,
    format = (v: number) => String(v),
    label
  }: { points: { x: string; y: number }[]; height?: number; format?: (v: number) => string; label: string } = $props();

  const W = 600;
  const PAD = { t: 12, r: 12, b: 24, l: 48 };

  let min = $derived(points.length ? Math.min(...points.map((p) => p.y)) : 0);
  let max = $derived(points.length ? Math.max(...points.map((p) => p.y)) : 1);
  let span = $derived(max - min || 1);
  let coords = $derived(
    points.map((p, i) => ({
      ...p,
      cx: PAD.l + (points.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i / (points.length - 1)) * (W - PAD.l - PAD.r)),
      cy: PAD.t + (1 - (p.y - min) / span) * (height - PAD.t - PAD.b)
    }))
  );
  let path = $derived(coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.cx.toFixed(1)},${c.cy.toFixed(1)}`).join(' '));
  let hover = $state<number | null>(null);
</script>

{#if points.length === 0}
  <p class="py-8 text-center text-sm text-slate-500">ยังไม่มีข้อมูล</p>
{:else}
  <svg viewBox="0 0 {W} {height}" class="h-auto w-full" role="img" aria-label={label}>
    {#each [0, 0.5, 1] as f (f)}
      {@const y = PAD.t + f * (height - PAD.t - PAD.b)}
      <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} class="stroke-slate-200" stroke-dasharray="3 3" />
      <text x={PAD.l - 6} y={y + 4} text-anchor="end" class="fill-slate-400 text-[10px]">{format(max - f * span)}</text>
    {/each}
    <path d={path} fill="none" class="stroke-brand-600" stroke-width="2" />
    {#each coords as c, i (i)}
      <circle
        cx={c.cx}
        cy={c.cy}
        r={hover === i ? 5 : 3}
        class="fill-brand-600"
        role="presentation"
        onmouseenter={() => (hover = i)}
        onmouseleave={() => (hover = null)}
      />
    {/each}
    <text x={PAD.l} y={height - 6} class="fill-slate-400 text-[10px]">{points[0]?.x}</text>
    <text x={W - PAD.r} y={height - 6} text-anchor="end" class="fill-slate-400 text-[10px]">{points.at(-1)?.x}</text>
    {#if hover !== null && coords[hover]}
      {@const c = coords[hover]!}
      <text x={c.cx} y={Math.max(c.cy - 10, 10)} text-anchor="middle" class="fill-slate-700 text-[11px] font-medium">{c.x}: {format(c.y)}</text>
    {/if}
  </svg>
{/if}
