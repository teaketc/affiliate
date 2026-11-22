import type { AnalyticsOverviewDto } from '@affiliate/shared';
import { load as get } from '$lib/server/api';
import type { PageServerLoad } from './$types';

const RANGES = [7, 30, 90, 365];

export const load: PageServerLoad = async (event) => {
  const d = Number(event.url.searchParams.get('days'));
  const days = RANGES.includes(d) ? d : 30;
  return { days, ranges: RANGES, overview: await get<AnalyticsOverviewDto>(event, '/api/v1/analytics/overview', { days }) };
};
