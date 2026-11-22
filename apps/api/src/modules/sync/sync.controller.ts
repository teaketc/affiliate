import { Elysia, t } from 'elysia';
import { ErrorResponse, Paginated, SyncJobDto, SyncJobQuery, SyncProductsBody } from '@affiliate/shared';
import { authPlugin } from '../../plugins/auth';
import { auditAction } from '../../plugins/request-context';
import type { AuthService } from '../auth/auth.service';
import type { SyncService } from './sync.service';

const security = [{ bearerAuth: [] }];
const IdParams = t.Object({ id: t.String({ format: 'uuid' }) });

export function syncController(auth: AuthService, sync: SyncService) {
  return new Elysia({ prefix: '/api/v1/sync' })
    .use(authPlugin(auth))
    .get('/jobs', ({ query }) => sync.list(query), {
      auth: { role: 'VIEWER' },
      query: SyncJobQuery,
      response: { 200: Paginated(SyncJobDto) },
      detail: { tags: ['Synchronization'], summary: 'Sync jobs (logs + status)', security }
    })
    .get('/jobs/:id', ({ params }) => sync.get(params.id), {
      auth: { role: 'VIEWER' },
      params: IdParams,
      response: { 200: SyncJobDto, 404: ErrorResponse },
      detail: { tags: ['Synchronization'], security }
    })
    .get('/queue', () => sync.queueCounts(), {
      auth: { role: 'VIEWER' },
      response: { 200: t.Record(t.String(), t.Number()) },
      detail: { tags: ['Synchronization'], summary: 'BullMQ queue counts', security }
    })
    .post(
      '/products',
      async ({ body, request, set }) => {
        const job = await sync.request(body, 'MANUAL');
        auditAction(request, 'sync.manual', { syncJobId: job.id, accountId: body.accountId, type: job.type });
        set.status = 202;
        return job;
      },
      {
        auth: { role: 'EDITOR' },
        body: SyncProductsBody,
        response: { 202: SyncJobDto, 400: ErrorResponse, 404: ErrorResponse, 409: ErrorResponse },
        detail: { tags: ['Synchronization'], summary: 'Trigger a manual product / price sync', security }
      }
    )
    .post(
      '/jobs/:id/retry',
      async ({ params, request, set }) => {
        const job = await sync.retry(params.id);
        auditAction(request, 'sync.retry', { from: params.id, syncJobId: job.id });
        set.status = 202;
        return job;
      },
      { auth: { role: 'EDITOR' }, params: IdParams, response: { 202: SyncJobDto, 400: ErrorResponse }, detail: { tags: ['Synchronization'], security } }
    )
    .post(
      '/jobs/:id/cancel',
      async ({ params, request }) => {
        const job = await sync.cancel(params.id);
        auditAction(request, 'sync.cancel', { syncJobId: params.id });
        return job;
      },
      { auth: { role: 'EDITOR' }, params: IdParams, response: { 200: SyncJobDto, 400: ErrorResponse }, detail: { tags: ['Synchronization'], security } }
    );
}
