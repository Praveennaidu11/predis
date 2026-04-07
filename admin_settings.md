# Admin settings CRUD

Tracks **Admin Settings** work phase-by-phase: API, UI, and operational notes. Only **admin** users may manage these (same as other `/admin/*` routes).

## Goal

- Persist platform configuration as **key/value** rows (`admin_settings` table).
- Full **CRUD** over settings for super admins.
- Optional **upsert by key** for grouped forms (AI / email / general).

## Data model (existing)

`Predis-Amealio-Backend/src/common/entities/admin-settings.entity.ts`

- `id` (uuid)
- `key` (unique)
- `value` (nullable text)
- `category` (nullable)
- `isEncrypted` (boolean, reserved for future — values are **not** encrypted in current phases)
- `updatedAt`

---

## Phase 1 — Backend CRUD + upsert (Completed)

### Endpoints (prefix `/api`)

All require `JwtAuthGuard` + `RolesGuard` + `@Roles('admin')`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/settings` | List settings (supports `search`, `category`, `limit`, `offset`; encrypted values are **masked**) |
| `GET` | `/admin/settings/:id` | Get one by id |
| `POST` | `/admin/settings` | Create (fails if `key` exists) |
| `PATCH` | `/admin/settings/:id` | Partial update by id |
| `DELETE` | `/admin/settings/:id` | Delete by id |
| `PUT` | `/admin/settings/upsert` | Upsert by `key` (body: key, value, category?, isEncrypted?) |
| `GET` | `/admin/settings-audit` | List audit events (supports `key`, `action`, `actorUserId`, `limit`, `offset`) |

### Files

- `Predis-Amealio-Backend/src/admin/dto/create-admin-setting.dto.ts`
- `Predis-Amealio-Backend/src/admin/dto/update-admin-setting.dto.ts`
- `Predis-Amealio-Backend/src/admin/dto/upsert-admin-setting.dto.ts`
- `Predis-Amealio-Backend/src/admin/admin.service.ts` (CRUD + upsert)
- `Predis-Amealio-Backend/src/admin/admin.controller.ts` (routes)

### Validation

- `key`: required on create/upsert; max length; allowed charset (letters, numbers, `.`, `_`, `-`).
- `value`: optional string (can be empty to clear).
- `category`: optional.

---

## Phase 2 — Encrypted secrets at rest (Deferred)

`isEncrypted` is stored but **no encryption layer** is applied yet. Future work:

- Encrypt `value` when `isEncrypted: true` using a server-side secret (KMS / env master key).
- Never return decrypted secrets to the browser in list endpoints (mask or omit).

---

## Phase 3 — Admin Settings UI wired to API (Completed)

### Behaviour

- `Predis-Amealio-Frontend/src/app/admin/settings/page.tsx` loads settings via `GET /api/admin/settings`.
- Maps known keys into the existing tabbed form (AI / integrations / email / general).
- Each tab **Save** calls `PUT /api/admin/settings/upsert` per field (category + `isEncrypted` where appropriate).

### Files

- `Predis-Amealio-Frontend/src/lib/api/adminSettings.ts`
- `Predis-Amealio-Frontend/src/app/admin/settings/page.tsx`

### Key conventions (stable)

| UI field | Setting key | Category |
|----------|-------------|----------|
| OpenAI API Key | `ai.openai_api_key` | `ai` |
| Anthropic API Key | `ai.anthropic_api_key` | `ai` |
| Google AI API Key | `ai.google_api_key` | `ai` |
| MSG91 Auth Key | `integrations.msg91_auth_key` | `integrations` |
| Razorpay Key ID | `integrations.razorpay_key_id` | `integrations` |
| Razorpay Key Secret | `integrations.razorpay_key_secret` | `integrations` |
| SMTP Host | `email.smtp_host` | `email` |
| SMTP Port | `email.smtp_port` | `email` |
| SMTP User | `email.smtp_user` | `email` |
| SMTP Password | `email.smtp_password` | `email` |
| Platform Name | `general.platform_name` | `general` |
| Support Email | `general.support_email` | `general` |

---

## Phase 4 — Application runtime reads settings from DB (Deferred)

Today the app still reads most secrets from **environment variables** at process start. To use DB settings everywhere you would:

- Inject a small `AdminSettingsService` (cached) and read keys where services start (email, payments, AI).
- Or document that admins edit DB for “display only” until runtime wiring is done.

---

## Phase 5 — Hardening (Completed)

- **Key format validation** on create/upsert (DTO `Matches` — letters, numbers, `.`, `_`, `-`).
- **Do not wipe secrets**: values that look like a mask-only placeholder (trimmed string of `*` with length ≥ 6) are **ignored** on update: `upsertSetting` and `updateSettingById` skip changing `value` when the payload is only asterisks; new rows get `null` instead of saving a mask string.
- **Sensitive fields** use `isEncrypted: true` on upsert from the UI for API keys and passwords (storage still plaintext until Phase 2).
- **Encrypted values are masked on read**: `GET /admin/settings*` never returns raw values when `isEncrypted=true` (returns `********` or `null`).

### Files

- Backend DTOs + `admin.service.ts` (`isMaskedPlaceholder` + upsert/patch behaviour)
- Frontend `adminSettings.ts` + settings page (`isMaskedPlaceholder` before calling upsert)

---

## Phase 6 — Advanced Admin Settings + Audit UI (Completed)

### UI additions

In `Predis-Amealio-Frontend/src/app/admin/settings/page.tsx`:

- **Advanced** tab
  - Search + category filter
  - Full CRUD (create / edit / delete)
  - Secret-safe editing: encrypted values are never shown; leaving secret value blank keeps existing secret
  - Delete confirmation requires typing the key
- **Audit Log** tab
  - Filter by key + action
  - Displays “secret changed (redacted)” for encrypted changes

### Backend additions

- New entity: `Predis-Amealio-Backend/src/common/entities/admin-settings-audit.entity.ts`
- Audit is written on: create / patch / upsert / delete with actor (`userId`, `email`) from JWT

---

## Quick test (admin token)

1. Login as admin; copy JWT.
2. `GET http://localhost:8001/api/admin/settings` with `Authorization: Bearer <token>`.
3. `PUT http://localhost:8001/api/admin/settings/upsert` with JSON `{ "key": "general.platform_name", "value": "Amealio", "category": "general" }`.
4. Open **Admin → Settings** in the frontend and verify:
   - Curated tabs load/save (AI/Integrations/Email/General)
   - Advanced tab can create/edit/delete and refresh
   - Audit Log tab shows the change events
