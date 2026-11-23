# Affiliate Product Extractor

วาง Affiliate URL ของ **Shopee** หรือ **Lazada** เพียงครั้งเดียว ระบบจะตรวจสอบลิงก์อย่างปลอดภัย ดึงข้อมูลสินค้า ตรวจสินค้าซ้ำ และ **บันทึกลง PostgreSQL อัตโนมัติ** พร้อม Extraction Log ทุกครั้ง ไม่มีขั้นตอน Preview หรือปุ่ม Save

- **Backend**: ElysiaJS · Bun · TypeScript strict · Prisma · PostgreSQL · Swagger
- **Frontend**: SvelteKit 2 · Svelte 5 (runes) · Tailwind CSS 4 · responsive admin dashboard
- **Infra**: Docker Compose · structured JSON logging

Architecture, sequence diagram, ER diagram and the security model are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Project structure

```
.
├── apps/
│   ├── api/                      ElysiaJS backend
│   │   ├── prisma/               schema.prisma + SQL migrations
│   │   ├── src/
│   │   │   ├── config/           env parsing / validation
│   │   │   ├── lib/              logger, AppError, response helpers
│   │   │   ├── security/         url-guard, ip, marketplaces allowlist, safe-fetch, rate-limit
│   │   │   ├── extractors/       ProductExtractor interface, Shopee/Lazada adapters,
│   │   │   │                     OG / JSON-LD parsers, normalizer, http clients (live + mock)
│   │   │   ├── modules/          extractor · products · extraction-logs · statistics · health
│   │   │   │                     (controller → service → repository)
│   │   │   ├── app.ts            app composition, CORS, Swagger, central error handler
│   │   │   └── index.ts          entrypoint
│   │   └── tests/                unit/ (no DB) + integration/ (real PostgreSQL)
│   └── web/                      SvelteKit dashboard
│       └── src/{lib,routes}      /, /extract, /products, /history
├── packages/shared/              DTOs, enums, error codes shared by api + web
├── docs/ARCHITECTURE.md
└── docker-compose.yml
```

## Quick start (Docker)

```bash
docker compose up --build
```

- Dashboard: http://localhost:3001
- API: http://localhost:3000 · Swagger UI: http://localhost:3000/swagger

Migrations run automatically when the API container starts. To try the full flow without contacting the marketplaces:

```bash
EXTRACTOR_MODE=mock docker compose up --build
```

## Local development

Requirements: Bun ≥ 1.2, PostgreSQL ≥ 14 (with the `pg_trgm` extension available).

```bash
bun install
```

```bash
cp apps/api/.env.example apps/api/.env && cp apps/web/.env.example apps/web/.env
```

Edit `DATABASE_URL` in `apps/api/.env`, then apply the migrations:

```bash
bun run db:deploy
```

Run the API and the dashboard in two terminals:

```bash
bun run dev:api
```

```bash
bun run dev:web
```

Dashboard: http://localhost:5173 · API: http://localhost:3000/swagger

## Tests

```bash
cd apps/api && bun test tests/unit
```

Integration tests use a real, **disposable** database (its tables are truncated):

```bash
cd apps/api && TEST_DATABASE_URL=postgresql://user@localhost:5432/affiliate_test bun run test:integration
```

Coverage: IP classification, URL guard, SSRF fetch (redirect to metadata IP, rebinding, depth, size, timeout), parsers, normaliser, rate limiter, extractors, and API flows (auto-save, duplicate update without null overwrite, concurrent race, partial save, every failure code writes a FAILED log, CRUD, filters, statistics).

Typecheck everything:

```bash
bun run typecheck
```

## API

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/extractor` | `{ "affiliateUrl": "…" }` → extract + auto-save (201 new, 200 duplicate updated) |
| GET | `/api/v1/products` | `page, pageSize, search, marketplace, shopType, sortBy, order` |
| GET | `/api/v1/products/:id` | Detail (includes `rawData`) |
| PATCH | `/api/v1/products/:id` | Update editable fields |
| DELETE | `/api/v1/products/:id` | Delete (logs are kept, `product_id` → NULL) |
| GET | `/api/v1/extraction-logs` | `page, pageSize, status, marketplace, search, productId` |
| GET | `/api/v1/extraction-logs/:id` | Detail with `extractedData` and product |
| GET | `/api/v1/statistics` | Dashboard counters |
| GET | `/health`, `/ready` | Liveness / readiness (DB check) |

Responses follow `{ success, status: "success" | "partial" | "failed", message, data | error: { code, message } }`.
Error codes: `INVALID_URL`, `UNSUPPORTED_MARKETPLACE`, `INVALID_AFFILIATE_URL`, `REDIRECT_FAILED`, `PRODUCT_NOT_FOUND`, `EXTRACTION_FAILED`, `PARTIAL_EXTRACTION`, `PROVIDER_ACCESS_DENIED`, `RATE_LIMITED`, `REQUEST_TIMEOUT`, `DATABASE_ERROR`, `DUPLICATE_PRODUCT` (+ `VALIDATION_ERROR`, `NOT_FOUND`, `INTERNAL_ERROR`).

## Limitations (read this)

**Official APIs are not connected.** The Shopee Affiliate Open API and the Lazada Open Platform affiliate APIs require partner approval, an app key/secret and documentation that only becomes available after you register, so this project does **not** guess their endpoints. The integration point is the `AuthorizedProductSource` interface in `apps/api/src/extractors/types.ts`. Implement it once you have verified credentials and docs, and pass it to `new ShopeeExtractor(http, [yourSource])` in `extractors/registry.ts`. Its fields then take priority over page metadata.

**Live mode reads only public page metadata.** It uses Open Graph, JSON-LD, `<title>`, the canonical link and product IDs from the URL, with an honest User-Agent. Observed behaviour while building this:

- **Lazada** product pages served Open Graph name and image, but no price, so the product was saved as `PARTIAL`.
- **Shopee** product pages are rendered by JavaScript and returned no product metadata, so the extraction failed with `EXTRACTION_FAILED`. Shopee can also redirect to a login or traffic-verification page, which is reported as `PROVIDER_ACCESS_DENIED`.

Login walls, CAPTCHA and anti-bot checks are never bypassed. To get reliable Shopee data, use the official affiliate API through `AuthorizedProductSource`. Make sure automated page reads are allowed by each marketplace's Terms of Service for your use case.

**`shopType` (Mall / Preferred / Normal)** stays `null` unless a source states it explicitly. Page metadata does not expose it reliably, so you can set it in the dashboard instead.

**Mock mode** (`EXTRACTOR_MODE=mock`) is for development only. It makes no network calls and simulates redirects and product pages, with names prefixed `[MOCK]`. Every other part of the pipeline is the real code. Path fragments `mock-blocked`, `mock-notfound`, `mock-timeout` and `mock-partial` trigger the matching error paths.

**Rate limiting** is in-memory per API instance. When you run several instances, implement the `RateLimiter` interface on Redis.

**Marketplace domains** are allowlisted in `apps/api/src/security/marketplaces.ts`. If a real affiliate link redirects through a host that is not listed, it fails with `REDIRECT_FAILED` and the host name appears in the log. Add the host only after you have confirmed that it belongs to the marketplace.
