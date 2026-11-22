import { fail } from '@sveltejs/kit';
import {
  GenerateLinkBody,
  type AccountDto,
  type AffiliateLinkDto,
  type CampaignDto,
  type PaginatedResult,
  type PriceHistoryDto,
  type ProductDetailDto
} from '@affiliate/shared';
import { api, failure, load as get } from '$lib/server/api';
import { parseForm } from '$lib/server/form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const id = event.params.id;
  const [product, history, accounts, campaigns, links] = await Promise.all([
    get<ProductDetailDto>(event, `/api/v1/products/${id}`),
    get<PriceHistoryDto>(event, `/api/v1/price-history/${id}`, { days: 90 }),
    get<AccountDto[]>(event, '/api/v1/accounts'),
    get<PaginatedResult<CampaignDto>>(event, '/api/v1/campaigns', { status: 'ACTIVE', limit: 100 }),
    get<PaginatedResult<AffiliateLinkDto>>(event, '/api/v1/affiliate/links', { productId: id, limit: 10 })
  ]);
  return {
    product,
    history,
    accounts: accounts.filter((a) => a.marketplace === product.marketplace && a.status === 'ACTIVE'),
    campaigns: campaigns.data,
    links: links.data
  };
};

export const actions: Actions = {
  generate: async (event) => {
    const form = await event.request.formData();
    form.set('productId', event.params.id);
    const parsed = parseForm(GenerateLinkBody, form, { arrays: ['subIds'] });
    if (!parsed.ok) return fail(400, { message: 'ข้อมูลไม่ถูกต้อง', errors: parsed.errors });
    try {
      const link = await api<AffiliateLinkDto>(event, '/api/v1/affiliate/generate-link', { method: 'POST', body: parsed.data });
      return { link };
    } catch (e) {
      return fail(400, failure(e));
    }
  }
};
