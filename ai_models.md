# AI Models

This document records how AI models/providers are integrated into the product, with a focus on **reusable, shared modules** (no duplicated logic between Merchant and Super Admin).

## Gemini implementation

### Goal (Priority 1 — AI Content Generation)

Build a **single** AI generation system that powers both:

- Merchant Dashboard (creation flow)
- Super Admin (management/QA workflows)

Required generation capabilities:

1. Text → Image
2. Image → Image
3. Text → Video
4. First frame + Last frame + Prompt → Video
5. First frame + Last frame → Video (no prompt)
6. UGC creation (open-source first; subscription-based provider layered on top)

Key rule: **Build once, apply everywhere.** Differences by role must be handled by **authorization + configuration**, not duplicated business logic.

### Why we use a job-based “Generation” layer

Video generation is long-running and unreliable when done synchronously. A job-based design:

- Keeps API requests fast (create job immediately, then poll status)
- Allows retries and better error reporting
- Standardizes the frontend flow for both images and videos
- Lets us swap providers (Gemini vs open-source) without rewriting UI

### Proposed shared architecture (Backend)

Create a new backend module (NestJS) that becomes the **single entry point** for all AI generation:

- **`GenerationProvider` interface**
  - Defines capabilities (text→image, image→image, video recipes, etc.)
  - Enables multiple implementations:
    - **Google (Gemini API key / AI Studio)** provider
    - **Open-source** provider (initially stubbed or minimal; expanded for UGC later)

- **`GenerationJobService`**
  - Validates inputs
  - Creates a job record (queued/processing/done/failed)
  - Runs the job using the selected provider
  - Stores results (URLs/paths) and metadata

- **`GenerationJob` persistence**
  - Stores request parameters and output references so Admin can audit and users can revisit results

#### API shape (single contract for UI)

- `POST /api/generation/jobs`
  - Creates a job for one “recipe”:
    - `text_to_image`
    - `image_to_image`
    - `text_to_video`
    - `first_last_prompt_to_video`
    - `first_last_to_video`
    - `ugc_create`
- `GET /api/generation/jobs/:id`
  - Returns job status and outputs (image/video URLs)

This aligns with the existing frontend polling pattern used by `/api/video/:id`, but generalizes it for all recipes and for both roles.

### Storage (dev-first)

Initial implementation stores generated media in local backend `temp/` and serves via HTTP.

- **Why**: fastest to implement and validate end-to-end behavior.
- **Constraint**: this is **dev-only**; production should move to object storage + signed URLs.

Important repo hygiene:

- Ensure `Predis-Amealio-Backend/temp/**` is ignored by git to avoid committing large outputs.

### Environment variables (Backend)

Required to enable Gemini prompt enhancement and frame-to-prompt (vision):

- `GEMINI_API_KEY`: Google AI Studio API key
- `GEMINI_MODEL` (optional): defaults to `gemini-2.0-flash`

If `GEMINI_API_KEY` is missing, the generation system still works but falls back to basic prompts (no Gemini enhancement).

### Frontend integration (shared UI)

We will implement a shared “generation UI module” (components + hook + API client) and use it in:

- **Merchant**: `src/app/merchant/create/page.tsx` (replace direct calls with the shared module)
- **Super Admin (Option B)**: embed the same module inside `src/app/admin/content/page.tsx`

Role differences:

- **Merchant**: focuses on generating/saving content for their account
- **Admin**: focuses on generating for testing/QA + inspecting outputs

But both flows must call the **same** backend endpoints and use the **same** polling/status UI.

### Provider selection & subscriptions (UGC)

UGC creation will start on open-source models first, then allow a premium provider path.

- **Why**: prevents vendor lock-in and enables a free tier.
- **How**: the job request includes a `provider`/`tier` selector (validated server-side based on subscription/role).

