# Changes made (Predis / Amealio)

This file summarizes the code changes applied in this workspace during our session.

**Living log**: if we do more work after this point, I will append new entries here (so you can track what changed and where).

## Frontend (Next.js) — `Predis-Amealio-Frontend`

### Recent Content (Dashboard)
- **Fix broken video thumbnails**: stopped rendering `generatedVideo` URLs inside `<img>`; now shows image preview when available, otherwise safe video/icon preview.
  - File: `src/components/dashboard/RecentContentSection.tsx`
- **Click to play**: clicking a Recent Content row opens a modal and plays video (and previews image/text when applicable).
  - File: `src/components/dashboard/RecentContentSection.tsx`
- **Video URL normalization**: supports relative `/temp/...` URLs by prefixing `NEXT_PUBLIC_BACKEND_URL`.
  - File: `src/components/dashboard/RecentContentSection.tsx`
- **Download/Open buttons (modal)**: added buttons under the video in the Recent Content modal.
  - File: `src/components/dashboard/RecentContentSection.tsx`
- **Share + status badge behavior**:
  - Share now shares/copies a link and does **not** trigger row click.
  - Status badge is clickable and filters the list (draft/published/scheduled) without opening the preview.
  - Added hover styles for Share + status pill.
  - Files:
    - `src/components/dashboard/RecentContentSection.tsx`
    - `src/app/merchant/dashboard/page.tsx` (stopped overriding share handler)

### Content Library (Merchant)
- **Prefer image preview** and avoid broken media previews.
  - File: `src/app/merchant/content/page.tsx`
- **Download/Open buttons in “View” modal** for videos.
  - File: `src/app/merchant/content/page.tsx`

### Create Content (Merchant)
- **Fix “Script Only” generation**: `script-only` and `reel-script` now use `/api/merchant/generate` (text output) instead of `/api/video/generate` (which only supports `text|image|multi-image`).
- **Save behavior**: script outputs are saved into `generatedText`, while real MP4 URLs are saved into `generatedVideo`.
  - File: `src/app/merchant/create/page.tsx`

### Social Media Connect (Merchant)
- Replaced demo connect (fake token) with real OAuth redirect:
  - Frontend requests OAuth URL from backend then redirects user to platform login.
  - File: `src/app/merchant/social/page.tsx`

### Merchant Profile
- Fixed runtime crash: removed stray code after component end that referenced an undefined `config`.
  - File: `src/app/merchant/profile/page.tsx`

### Signup (OTP + strong password UI)
- Signup now shows a **password strength meter** and **rule checklist** (min 8 chars, number, special char) plus **confirm password** UI.
- OTP dialog now includes **Resend OTP** button with countdown (calls `/api/auth/resend-email-otp`).
  - File: `src/components/auth/SignupForm.tsx`

### Logout
- Logout now clears auth and redirects to `/login` reliably; also added hover styling.
  - File: `src/components/layout/DashboardLayout.tsx`

### Admin Dashboard UX
- Admin dashboard cards/sections now have hover styles and are clickable for navigation.
  - File: `src/app/admin/dashboard/page.tsx`

### Admin Users
- Admin users page now loads real DB users from backend (`/api/admin/users`) and updates tier via backend (`/api/admin/users/:id/tier`).
  - File: `src/app/admin/users/page.tsx`

### Admin Content (new)
- Added new **global admin content** page with status filter + search.
  - File: `src/app/admin/content/page.tsx`
- Updated admin dashboard navigation to use `/admin/content` for content-related cards.
  - File: `src/app/admin/dashboard/page.tsx`
- Added admin sidebar link for Content.
  - File: `src/components/layout/DashboardLayout.tsx`

### Admin Settings (UI only)
- Admin settings page remains **UI-only** (Save shows toast; no persistence).
  - File: `src/app/admin/settings/page.tsx`

## Backend (NestJS) — `Predis-Amealio-Backend`

### Social API auth fix
- Made `GET /api/social/platforms` public (no JWT) while keeping other social routes protected with `JwtAuthGuard`.
  - File: `src/social/social.controller.ts`

### Social OAuth URLs
- Added backend endpoint to generate platform OAuth authorization URL:
  - `GET /api/social/oauth/url/:platform?redirectUri=...`
  - Files:
    - `src/social/social.controller.ts`
    - `src/social/social.service.ts`

### Video generation payload tweaks (provider troubleshooting)
- Adjusted text-to-video request payload generation (duration fields and long URL routing support) to better match upstream providers.
- Added response summary logging to help debug duration issues.
  - File: `src/integrations/ai/ai.service.ts`

### Admin Content API (new)
- Added admin endpoint for global content listing:
  - `GET /api/admin/content?status=...&limit=...`
  - Files:
    - `src/admin/admin.controller.ts`
    - `src/admin/admin.service.ts`

### Admin Settings API / runtime (removed)
- Removed the Admin Settings API (`/api/admin/settings`) and DB-driven runtime configuration for SMTP/MSG91.
- Backend continues to use `.env` via `ConfigService` for SMTP/MSG91.

### FFmpeg workaround (added then removed)
- A server-side “extend short videos to requested duration” workaround using ffmpeg/ffprobe was implemented and later **removed** at your request.
  - Files ultimately left **without** ffmpeg changes:
    - `package.json` (no ffmpeg deps)
    - `src/video/video.service.ts` (no ffmpeg logic)

