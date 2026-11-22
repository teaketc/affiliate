import type { AnalyticsOverviewDto, PaginatedResult, SyncJobDto } from '@affiliate/shared';
import { load as get } from '$lib/server/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const [overview, jobs] = await Promise.all([
    get<AnalyticsOverviewDto>(event, '/api/v1/analytics/overview', { days: 30 }),
    get<PaginatedResult<SyncJobDto>>(event, '/api/v1/sync/jobs', { limit: 5 })
  ]);
  return { overview, jobs: jobs.data };
};
