## Brand Management

This document tracks the **Brand Management** feature implementation in this repo, phase-by-phase, so any developer can quickly understand what exists, where it lives, and how to test it.

### Goal

Allow **Merchants** to manage brand identity and reuse it across generated/saved content.

Feature requirements (reference):
- Create brand
- Upload brand logo
- Brand color settings
- Brand typography
- Associate brand with generated content

---

## Phase 1 — Brand CRUD (Backend)

### What was implemented

**Backend (NestJS)**
- Added a dedicated **Brand module** with merchant-scoped CRUD.
- Ownership is enforced using `JwtAuthGuard` and `req.user.userId`.
- Brand fields supported: `name`, `logo` (URL string), `primaryColor`, `secondaryColor`, `fontFamily`.

### Endpoints

All routes are under global prefix `/api` (see `src/main.ts`).

- `POST /api/merchant/brands` — create a brand
- `GET /api/merchant/brands` — list brands for current merchant
- `GET /api/merchant/brands/:id` — get a single brand (merchant-owned)
- `PATCH /api/merchant/brands/:id` — update a brand
- `DELETE /api/merchant/brands/:id` — delete a brand

### Validation rules
- `name`: required, max 120 chars
- `primaryColor`, `secondaryColor`: optional, must be hex `#fff` or `#ffffff`
- `fontFamily`: optional string
- `logo`: optional URL string (file upload comes in Phase 2)

### Files
- Backend:
  - `Predis-Amealio-Backend/src/brand/brand.module.ts`
  - `Predis-Amealio-Backend/src/brand/brand.controller.ts`
  - `Predis-Amealio-Backend/src/brand/brand.service.ts`
  - `Predis-Amealio-Backend/src/brand/dto/create-brand.dto.ts`
  - `Predis-Amealio-Backend/src/brand/dto/update-brand.dto.ts`
  - `Predis-Amealio-Backend/src/app.module.ts` (imports `BrandModule`)

---

## Phase 2 — Brand logo upload (Backend)

### What was implemented

**Backend**
- A multipart upload endpoint that stores the logo under the server `temp/` directory.
- The backend already serves `/temp/*` as static assets (see `src/main.ts`), so uploaded logos become accessible via a URL.
- After upload, the brand’s `logo` field is updated to the URL.

### Endpoint

- `POST /api/merchant/brands/:id/logo`
  - **Auth**: Bearer token (merchant)
  - **Body**: `multipart/form-data`
    - field name: `file`
    - types allowed: `image/png`, `image/jpeg`, `image/webp`
    - max size: 2MB

### Storage
- Destination: `temp/brands/<userId>/<uuid>.<ext>`
- Served by backend at: `/temp/brands/<userId>/<filename>`

### Files
- Backend:
  - `Predis-Amealio-Backend/src/brand/brand.controller.ts` (upload endpoint)
  - `Predis-Amealio-Backend/src/brand/brand.service.ts` (`setLogo`)
  - `Predis-Amealio-Backend/src/main.ts` (static `/temp` serving already present)

---

## Phase 3 — Brand Management UI (Frontend)

### What was implemented

**Frontend (Next.js)**
- Added a Merchant Brands page to:
  - Create brand
  - Edit brand
  - Delete brand
  - Upload logo via the Phase 2 backend endpoint
- Added a sidebar link to access it.

### Routes / UI
- Merchant page:
  - `GET /merchant/brands` (frontend route)

### Frontend API client
- `brandsApi` wraps the backend endpoints:
  - list/create/update/delete
  - uploadLogo (multipart)

### Files
- Frontend:
  - `Predis-Amealio-Frontend/src/app/merchant/brands/page.tsx`
  - `Predis-Amealio-Frontend/src/lib/api/brands.ts`
  - `Predis-Amealio-Frontend/src/components/layout/DashboardLayout.tsx` (added “Brands” link)

---

## Phase 4 — Associate brand with generated content (Completed)

### What already exists
- Backend `Content` entity already supports `brandId` and relation to `Brand`:
  - `Predis-Amealio-Backend/src/common/entities/content.entity.ts`
- Content DTOs already include optional `brandId` (generate/save).

### What was implemented
- Frontend `merchant/create` now:
  - Loads brands from `GET /api/merchant/brands`
  - Provides a **Brand (optional)** selector (Step 2.5)
  - Sends `brandId` when generating content (text/image and script-only video)
  - Sends `brandId` when saving generated content to library

### Files
- Frontend:
  - `Predis-Amealio-Frontend/src/app/merchant/create/page.tsx` (brand selector + request payloads)

---

## Phase 5 — Hardening & reliability (Completed)

### What was implemented
- **Logo upload URL robustness**: logo URLs are now generated from:
  - `BACKEND_URL` if set, otherwise
  - request-derived base URL (`x-forwarded-*` / host / protocol), so it works behind proxies too.
- **File extension safety**:
  - Logo filenames are forced to a safe extension based on MIME type (`.png`, `.jpg`, `.webp`).
  - Prevents weird original extensions causing broken rendering.
- **Best-effort cleanup**:
  - When a logo is replaced or a brand is deleted, the old local logo file under `temp/brands/...` is deleted (best-effort; failures don’t break API).

### Files
- Backend:
  - `Predis-Amealio-Backend/src/brand/brand.controller.ts`
  - `Predis-Amealio-Backend/src/brand/brand.service.ts`

