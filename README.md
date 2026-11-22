# Shopee & Lazada Affiliate Data Service

ระบบรวบรวมข้อมูลสินค้า ราคา และสร้างลิงก์ Affiliate จาก **Shopee Affiliate Open API** และ **Lazada Open Platform (Affiliate)** พร้อม Admin Dashboard

| ส่วน | เทคโนโลยี |
|---|---|
| `apps/api` | ElysiaJS 1.4 บน Bun · TypeScript strict · Prisma 6 · BullMQ 5 + ioredis · pino · OpenAPI (`/docs`) |
| `apps/web` | SvelteKit 2 · Svelte 5 (runes) · Tailwind CSS 4 · adapter-node |
| `packages/shared` | TypeBox schemas + types ใช้ร่วมกันระหว่าง API (validation/Swagger) และ Dashboard (form validation) |
| `prisma` | Schema + SQL migrations (PostgreSQL 16+, Full-text search, GIN/B-tree/BRIN indexes) |

เอกสารสถาปัตยกรรม, ER Diagram และ Index strategy: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** · การ deploy: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

---

## โครงสร้าง Monorepo

```
.
├── apps/
│   ├── api/                       # ElysiaJS (Bun)
│   │   ├── src/
│   │   │   ├── app.ts             # Elysia app: CORS, security headers, rate limit, error envelope, audit, Swagger
│   │   │   ├── container.ts       # composition root (DI)
│   │   │   ├── index.ts           # HTTP entrypoint
│   │   │   ├── worker.ts          # BullMQ worker entrypoint (separate process)
│   │   │   ├── config/env.ts      # validated env (TypeBox)
│   │   │   ├── lib/               # logger, prisma, redis, cache, crypto (AES-256-GCM), rate limiter, errors
│   │   │   ├── plugins/           # auth macro (JWT / API key + RBAC), request context
│   │   │   ├── providers/         # Provider interface + Shopee / Lazada adapters (HTTP only)
│   │   │   ├── modules/<name>/    # controller → service → repository ต่อโมดูล
│   │   │   └── scripts/seed.ts    # สร้าง SUPER_ADMIN คนแรก
│   │   ├── test/unit/             # signers, mappers, providers (fake HTTP), services, RBAC, crypto …
│   │   ├── test/integration/      # end-to-end: Postgres + Redis จริง, marketplace HTTP stub
│   │   └── Dockerfile
│   └── web/                       # SvelteKit admin dashboard
│       ├── src/hooks.server.ts    # session (httpOnly cookie) + auth guard
│       ├── src/lib/server/        # API client (server-only) + shared-schema form parser
│       ├── src/routes/            # overview, products, marketplaces, accounts, campaigns, links,
│       │                          # prices, sync, analytics, api-keys, settings, login
│       └── Dockerfile
├── packages/shared/               # TypeBox schemas, enums, formatters
├── prisma/
│   ├── schema.prisma
│   └── migrations/20261122000000_init/migration.sql
├── docs/ARCHITECTURE.md · docs/DEPLOYMENT.md
├── docker-compose.yml
└── .env.example
```

## เริ่มต้นด้วย Docker Compose

```bash
cp .env.example .env
```

แก้ค่า secret ใน `.env` (สร้างด้วยคำสั่งด้านล่าง) แล้วรัน:

```bash
openssl rand -hex 32      # JWT_SECRET
openssl rand -base64 32   # CREDENTIALS_ENCRYPTION_KEY
openssl rand -hex 16      # CLICK_IP_SALT
```

```bash
docker compose up -d --build
```

```bash
docker compose run --rm -e SEED_ADMIN_EMAIL=you@example.com -e SEED_ADMIN_PASSWORD='a-long-password' api bun apps/api/src/scripts/seed.ts
```

- Dashboard: http://localhost:5173 · API: http://localhost:3000 · Swagger UI: http://localhost:3000/docs
- `migrate` service รัน `prisma migrate deploy` ก่อน `api`/`worker` จะเริ่ม

## พัฒนาบนเครื่อง (ไม่ใช้ Docker)

ต้องมี Bun ≥ 1.2, PostgreSQL ≥ 15, Redis ≥ 7

```bash
bun install
```

```bash
bun run db:generate && bun run db:migrate
```

```bash
bun run db:seed
```

เปิด 3 terminal:

```bash
bun run dev:api
```

```bash
bun run dev:worker
```

```bash
bun run dev:web
```

> `apps/web` อ่าน `API_URL` (server-side เท่านั้น) — เบราว์เซอร์ไม่เคยเรียก API หรือเห็น JWT โดยตรง

## Marketplace Providers — สิ่งที่ยืนยันแล้ว

ไม่มีการสมมติ endpoint ที่ไม่มีในเอกสาร รายละเอียดอยู่ใน [docs/ARCHITECTURE.md §3](docs/ARCHITECTURE.md)

| | สถานะ | แหล่งที่มา |
|---|---|---|
| **Lazada** signature (HMAC-SHA256, sorted params, uppercase hex) | ✅ ยืนยันจากเอกสารทางการ | open.lazada.com → Signature algorithm |
| **Lazada** `/marketing/product/feed`, `/marketing/getlink` (params + response) | ✅ ยืนยันจากเอกสารทางการ | open.lazada.com → API reference |
| **Shopee** signature `SHA256(AppId+Timestamp+Payload+Secret)` + `generateShortLink` | ✅ ยืนยันจาก client ที่เผยแพร่ | — |
| **Shopee** `productOfferV2` fields | ⚠️ **ต้องตรวจกับเอกสารใน Affiliate Dashboard** (ต้อง login) ก่อนใช้งานจริง | `apps/api/src/providers/shopee/queries.ts` |

ข้อจำกัดที่มาจาก API จริง:
- Lazada product feed **ไม่มี parameter keyword** → ระบบกรอง keyword ในฝั่งเราหลังดึงข้อมูล; feed ไม่มี URL สินค้า → ใช้ URL หน้าร้านสาธารณะ `https://www.lazada.<tld>/products/i{id}.html` สำหรับแสดงผล และสร้างลิงก์ด้วย `inputType=productId`
- Lazada feed ไม่มีราคาเดิม (`originalPrice`) → `discount_rate = 0` สำหรับ Lazada
- Shopee รับ sub IDs สูงสุด 5, Lazada สูงสุด 6 (โค้ดแคมเปญจะอยู่ช่องแรกเสมอ)
- Response ของ Shopee ถูก validate ด้วย TypeBox ถ้า schema เปลี่ยน งาน sync จะล้มเหลวพร้อมข้อความชัดเจน (ไม่เขียนข้อมูลผิดลง DB)

## REST API

ทุก endpoint มี schema validation + เอกสารใน Swagger (`/docs`, JSON ที่ `/docs/json`)

| Method | Path | สิทธิ์ (JWT role / API-key scope) |
|---|---|---|
| GET | `/health` · `/ready` | public |
| GET | `/r/:code` | public — click tracking redirect (302) |
| POST | `/api/v1/auth/login` · GET `/api/v1/auth/me` | public · VIEWER |
| GET | `/api/v1/products` · `/products/search` · `/products/:id` | VIEWER / `products:read` |
| GET | `/api/v1/categories` | VIEWER / `products:read` |
| POST | `/api/v1/affiliate/generate-link` | EDITOR / `affiliate:write` |
| GET | `/api/v1/affiliate/links` | VIEWER / `affiliate:read` |
| GET | `/api/v1/price-history/:productId` · `/price-compare` · `/promotions` | VIEWER / `products:read` |
| GET | `/api/v1/sync/jobs` · `/sync/jobs/:id` · `/sync/queue` | VIEWER |
| POST | `/api/v1/sync/products` · `/sync/jobs/:id/retry` · `/sync/jobs/:id/cancel` | EDITOR |
| GET | `/api/v1/analytics/overview` | VIEWER / `analytics:read` |
| GET/PATCH | `/api/v1/providers` · `/providers/:id` | VIEWER · ADMIN |
| GET/POST/PATCH | `/api/v1/accounts` · `/accounts/:id` · POST `/accounts/:id/test` | VIEWER · ADMIN |
| GET/POST/PATCH | `/api/v1/campaigns` · `/campaigns/:id` | VIEWER · EDITOR |
| GET/POST/DELETE | `/api/v1/api-keys` · `/api-keys/:id` | ADMIN |
| GET/PUT | `/api/v1/settings` | VIEWER · ADMIN |
| GET | `/api/v1/audit-logs` | ADMIN |
| GET/POST/PATCH | `/api/v1/users` · `/users/:id` | SUPER_ADMIN |

ตัวอย่างสำหรับ External client:

```bash
curl -H "X-API-Key: ak_live_xxx" "http://localhost:3000/api/v1/products/search?q=หูฟัง&minCommission=10&sort=commission_desc"
```

รูปแบบ error มาตรฐาน:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed", "requestId": "…", "details": [] } }
```

## Security

- **Admin**: JWT HS256 (`jose`) อายุ 8 ชม. เก็บใน httpOnly + SameSite=Strict cookie ฝั่ง SvelteKit; สถานะผู้ใช้/role ถูกตรวจจาก DB ทุก request
- **External clients**: API key (`X-API-Key`) เก็บเฉพาะ SHA-256 hash, มี scopes, per-key rate limit, วันหมดอายุ, revoke ได้; API key **ไม่สามารถ**เรียก endpoint ที่ไม่มี scope (เช่น admin routes)
- **RBAC**: `SUPER_ADMIN > ADMIN > EDITOR > VIEWER`
- **Provider credentials**: เข้ารหัส AES-256-GCM ที่ระดับ application, ไม่ถูกส่งกลับไปยัง client, ถูก redact ใน log
- **SSRF guard**: endpoint ของบัญชีต้องเป็นโฮสต์ทางการของ Shopee/Lazada (https เท่านั้น); `originUrl` ต้องเป็นโดเมน marketplace
- Rate limit: ต่อ IP (global), ต่อ API key, login brute-force (10 ครั้ง/15 นาที), outbound ต่อ marketplace (แชร์ผ่าน Redis)
- Audit log: ทุก request `/api/*` ลง `api_logs` พร้อม `action` สำหรับการเปลี่ยนแปลงสำคัญ
- Click tracking เก็บเฉพาะ `SHA-256(ip + salt)` ไม่เก็บ IP ดิบ
- Security headers (API + Web), CSP บน SvelteKit, CSRF origin check ของ SvelteKit

## Testing

```bash
bun run typecheck
```

```bash
bun run test
```

Integration tests (Postgres + Redis จริง) จะถูกข้ามถ้าไม่ได้ตั้งค่า env:

```bash
INTEGRATION_DATABASE_URL=postgresql://postgres@localhost:5432/affiliate_test INTEGRATION_REDIS_URL=redis://localhost:6379/15 bun --cwd=apps/api test test/integration
```

> ⚠️ integration test จะ `TRUNCATE` ทุกตารางและ `FLUSHDB` Redis — ใช้ฐานข้อมูลสำหรับทดสอบเท่านั้น (ต้อง `prisma migrate deploy` ก่อน)

ครอบคลุม: Lazada signature ตาม doc example, Shopee header, mapping จาก sample response ทางการ, retry/permanent error ของ sync, RBAC/scopes, SSRF guard, AES-GCM tamper detection, FTS ภาษาไทย, click redirect, audit log, retention, OpenAPI

## Scripts

| คำสั่ง | ทำอะไร |
|---|---|
| `bun run dev:api` / `dev:worker` / `dev:web` | dev servers |
| `bun run db:generate` | Prisma client |
| `bun run db:migrate` | `prisma migrate deploy` |
| `bun run db:migrate:dev` | สร้าง migration ใหม่ (`--create-only` — ตรวจ SQL ก่อน เพราะมี generated column/CHECK ที่เขียนมือ) |
| `bun run db:seed` | สร้าง SUPER_ADMIN |
| `bun run typecheck` / `bun run test` | ทุก workspace |
