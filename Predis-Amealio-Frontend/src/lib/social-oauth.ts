/**
 * Browser OAuth entry points for merchant social connect.
 * Register the same redirect URI in each provider (e.g. http://localhost:3000/oauth/callback).
 */

const STATE_STORAGE_KEY = 'social_oauth_state_nonce';

export type SocialOAuthPlatform = 'instagram' | 'facebook' | 'linkedin';

export function getOAuthRedirectUri(): string {
  if (typeof window === 'undefined') return '';
  const fromEnv = process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return `${window.location.origin}/oauth/callback`;
}

function encodeState(platform: SocialOAuthPlatform): string {
  const nonce =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(STATE_STORAGE_KEY, nonce);
  }
  const payload = { platform, r: nonce };
  return btoa(JSON.stringify(payload));
}

/** Validates `state` nonce from the redirect (must match value set in startSocialOAuth). */
export function assertOAuthNonce(nonce: string | undefined): void {
  if (typeof sessionStorage === 'undefined' || !nonce) {
    throw new Error('Missing OAuth state. Start the connection from Social accounts again.');
  }
  const expected = sessionStorage.getItem(STATE_STORAGE_KEY);
  if (!expected || expected !== nonce) {
    throw new Error('Invalid OAuth state (possible CSRF). Try connecting again.');
  }
}

export function clearOAuthNonce(): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(STATE_STORAGE_KEY);
  }
}

/**
 * Redirects the browser to the provider login. Returns an error message if env is missing.
 */
export function startSocialOAuth(platform: SocialOAuthPlatform): string | undefined {
  const redirectUri = getOAuthRedirectUri();
  const state = encodeState(platform);

  if (platform === 'linkedin') {
    const clientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID?.trim();
    if (!clientId) {
      return 'LinkedIn is not configured. Set NEXT_PUBLIC_LINKEDIN_CLIENT_ID and add this redirect URI in LinkedIn Developer Portal.';
    }
    const scope = (
      process.env.NEXT_PUBLIC_LINKEDIN_OAUTH_SCOPE?.trim() || 'openid profile w_member_social'
    ).replace(/\s+/g, ' ');
    const u = new URL('https://www.linkedin.com/oauth/v2/authorization');
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', clientId);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('state', state);
    u.searchParams.set('scope', scope);
    window.location.href = u.toString();
    return undefined;
  }

  if (platform === 'instagram') {
    const clientId = process.env.NEXT_PUBLIC_INSTAGRAM_CLIENT_ID?.trim();
    if (!clientId) {
      return 'Instagram is not configured. Set INSTAGRAM_CLIENT_ID in Predis-Amealio-Backend/.env (same app as in Meta Developer → Instagram product) so it can be exposed to the browser, or set NEXT_PUBLIC_INSTAGRAM_CLIENT_ID. Register the redirect URI on the Instagram / Meta app.';
    }
    // Instagram Login UI (not Facebook). Use Instagram Basic Display scopes by default; for Instagram API with Login, set NEXT_PUBLIC_INSTAGRAM_OAUTH_SCOPE in Meta’s docs.
    const scope = (
      process.env.NEXT_PUBLIC_INSTAGRAM_OAUTH_SCOPE?.trim() || 'user_profile,user_media'
    ).replace(/\s+/g, '');
    const authorizePath =
      process.env.NEXT_PUBLIC_INSTAGRAM_OAUTH_AUTHORIZE_URL?.trim() ||
      'https://api.instagram.com/oauth/authorize';
    const u = new URL(authorizePath);
    u.searchParams.set('client_id', clientId);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('scope', scope);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('state', state);
    window.location.href = u.toString();
    return undefined;
  }

  const appId =
    process.env.NEXT_PUBLIC_FACEBOOK_APP_ID?.trim() ||
    process.env.NEXT_PUBLIC_META_APP_ID?.trim();
  if (!appId) {
    return 'Facebook is not configured. Set FACEBOOK_APP_ID in Predis-Amealio-Backend/.env (or NEXT_PUBLIC_FACEBOOK_APP_ID). Add the redirect URI in the Meta app (Facebook Login).';
  }

  const scope =
    'pages_show_list,pages_read_engagement,pages_manage_posts,public_profile';

  const u = new URL('https://www.facebook.com/v20.0/dialog/oauth');
  u.searchParams.set('client_id', appId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', scope);

  window.location.href = u.toString();
  return undefined;
}
