/**
 * Keyword-scored fallback prompts when Gemini is unavailable or returns nothing.
 * Tags are matched against a normalized user fragment (lowercase).
 */

export type FallbackEntry = {
  tags: string[];
  text: string;
  types?: Array<'text' | 'image' | 'video'>;
};

export const PROMPT_SUGGESTION_FALLBACKS: FallbackEntry[] = [
  {
    tags: ['college', 'fest', 'festival', 'campus', 'university', 'student'],
    types: ['text', 'image'],
    text: 'College fest announcement: energetic Instagram caption for our annual cultural festival, date and venue, welcome all students, 8–12 hashtags for campus life and events.',
  },
  {
    tags: ['caption', 'instagram', 'post', 'write'],
    types: ['text'],
    text: 'Instagram caption for a lifestyle photo: hook in the first line, friendly tone, one clear CTA, then relevant hashtags for reach.',
  },
  {
    tags: ['hashtag', 'hashtags', 'tags'],
    types: ['text'],
    text: 'Generate 25–30 niche + broad Instagram hashtags for a sustainable fashion brand launch; mix discovery and intent tags.',
  },
  {
    tags: ['linkedin', 'professional', 'b2b'],
    types: ['text'],
    text: 'LinkedIn post: thought leadership on remote work trends, hook, 3 short paragraphs, one actionable takeaway, end with a discussion question.',
  },
  {
    tags: ['facebook', 'fb', 'community'],
    types: ['text'],
    text: 'Facebook post for a local business: warm community tone, short story, offer or event CTA, encourage comments and shares.',
  },
  {
    tags: ['sale', 'discount', 'offer', 'promo'],
    types: ['text', 'image'],
    text: 'Flash sale announcement: urgency without spam, highlight top discount, trust line (returns/shipping), strong CTA and branded hashtags.',
  },
  {
    tags: ['product', 'launch', 'new'],
    types: ['text', 'image', 'video'],
    text: 'Product launch teaser: problem → solution → key benefit, platform-appropriate length, clear CTA to learn more or pre-order.',
  },
  {
    tags: ['food', 'restaurant', 'cafe', 'menu'],
    types: ['text', 'image'],
    text: 'Mouth-watering caption for a food photo: sensory words, dish name, location tag idea, and hashtags for foodies in the city.',
  },
  {
    tags: ['fitness', 'gym', 'workout', 'health'],
    types: ['text', 'image', 'video'],
    text: 'Motivational fitness caption: transformation angle or tip, authentic tone, invite followers to share their goal in comments.',
  },
  {
    tags: ['travel', 'trip', 'vacation', 'destination'],
    types: ['text', 'image'],
    text: 'Travel diary caption: one vivid moment from the trip, practical tip for visitors, wanderlust hashtags without being generic.',
  },
  {
    tags: ['reel', 'short', 'video', 'tiktok'],
    types: ['video', 'text'],
    text: '15-second vertical video concept: hook in first 2 seconds, 3 quick cuts, on-screen text ideas, strong end CTA.',
  },
  {
    tags: ['image', 'banner', 'poster', 'visual'],
    types: ['image'],
    text: 'Social image brief: bold composition, brand colors, readable headline space, minimal clutter, describe mood and lighting.',
  },
  {
    tags: ['quote', 'motivation', 'monday'],
    types: ['text', 'image'],
    text: 'Short inspirational quote post: one punchy line, credit if needed, caption expands with a relatable lesson for our audience.',
  },
  {
    tags: ['event', 'webinar', 'register'],
    types: ['text', 'image'],
    text: 'Event registration post: what, when, where, who it is for, one reason to attend, link or “DM us” CTA, urgency if seats limited.',
  },
];

export function scoreFallbackSuggestions(
  fragment: string,
  contentType: 'text' | 'image' | 'video',
  limit: number,
): string[] {
  const q = fragment.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!q) return [];

  const tokens = new Set(
    q.split(/[^a-z0-9]+/i).filter((t) => t.length >= 2),
  );

  const scored = PROMPT_SUGGESTION_FALLBACKS.map((entry) => {
    if (entry.types && !entry.types.includes(contentType)) {
      return { entry, score: 0 };
    }
    let score = 0;
    for (const tag of entry.tags) {
      const tl = tag.toLowerCase();
      if (q.includes(tl)) score += 12;
      if (tokens.has(tl)) score += 8;
    }
    if (q.length >= 4 && entry.text.toLowerCase().includes(q.slice(0, 12))) {
      score += 3;
    }
    return { entry, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const { entry } of scored) {
    const key = entry.text.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry.text);
    if (out.length >= limit) break;
  }

  return out;
}

/** When fragment matches no tags and AI returned nothing — still show a few type-appropriate starters. */
export function getDefaultFallbacksForType(
  contentType: 'text' | 'image' | 'video',
  limit: number,
): string[] {
  return PROMPT_SUGGESTION_FALLBACKS.filter(
    (e) => !e.types || e.types.includes(contentType),
  )
    .slice(0, limit)
    .map((e) => e.text);
}
