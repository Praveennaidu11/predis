# Query optimization

This document tracks query-level optimizations (beyond indexing) for the backend.

## Goal

- Reduce **DB round trips** per request
- Reduce **rows read** and **payload size**
- Move aggregations to Postgres (`SUM`, `COUNT`, `GROUP BY`) instead of loading rows into Node and reducing
- Ensure all list endpoints have sane **pagination** defaults/limits

## Scope in this project

### High-traffic / high-cost endpoints

- Merchant dashboard stats (`UserService.getDashboardStats`)
  - Currently: multiple `count()` calls + recent list with relation loads
- Analytics overview and platform breakdown (`AnalyticsService`)
  - Currently: loads many rows + aggregates in JS
- Admin content list (`AdminService.getContent`)
  - Currently: relation loads; add pagination inputs and avoid over-selecting

## Phases

### Phase 1 — Analytics aggregation in SQL (Completed)

- Replace:
  - `getOverview`: fetch many analytics rows → reduce in Node
  - `getPlatformBreakdown`: fetch all content with analytics relations → reduce in Node
- With:
  - One SQL query each using `SUM(...)` and `GROUP BY platform`
- Keep Redis caching for overview.

### Phase 2 — Dashboard stats (Completed)

- Replace 3 separate content `count()` calls with a single `GROUP BY status` query.
- Fetch recent content via query builder selecting only needed fields + brand (no large payload).

### Phase 3 — Admin content list (Completed)

- Add `offset` support and clamp `limit` (1–200).
- Use query builder with explicit selects and joins to avoid over-fetching.

## Test plan

- Validate output equivalence for:
  - analytics totals and per-platform breakdown
  - dashboard counts and recent list
- Build backend (`npm run build`)

## Files changed

- `Predis-Amealio-Backend/src/analytics/analytics.service.ts`
- `Predis-Amealio-Backend/src/user/user.service.ts`
- `Predis-Amealio-Backend/src/admin/admin.service.ts`
- `Predis-Amealio-Backend/src/admin/admin.controller.ts`

