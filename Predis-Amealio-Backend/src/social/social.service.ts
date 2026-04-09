import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SocialAccount } from '../common/entities/social-account.entity';
import { Content } from '../common/entities/content.entity';
import { Analytics } from '../common/entities/analytics.entity';
import { ConnectSocialDto } from './dto/connect-social.dto';
import { PublishContentDto } from './dto/publish-content.dto';
import { OAuthCallbackDto } from './dto/oauth-callback.dto';
import axios, { AxiosError } from 'axios';

const GRAPH_API = 'https://graph.facebook.com/v20.0';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublishResult {
  success: boolean;
  contentId: string;
  platform: string;
  platformPostId: string;
  accountId: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    @InjectRepository(SocialAccount)
    private socialAccountRepository: Repository<SocialAccount>,
    @InjectRepository(Content)
    private contentRepository: Repository<Content>,
    @InjectRepository(Analytics)
    private analyticsRepository: Repository<Analytics>,
    private configService: ConfigService,
  ) {}

  // ─── Account Management ────────────────────────────────────────────────────

  async getUserAccounts(userId: string) {
    return this.socialAccountRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async connectAccount(userId: string, dto: ConnectSocialDto) {
    const existing = await this.socialAccountRepository.findOne({
      where: {
        userId,
        platform: dto.platform,
        accountName: dto.accountName,
      },
    });

    if (existing) {
      throw new BadRequestException('This account is already connected');
    }

    const account = this.socialAccountRepository.create({
      userId,
      platform: dto.platform,
      accountName: dto.accountName,
      accessToken: dto.accessToken,
      refreshToken: dto.refreshToken,
      expiresAt: dto.expiresAt,
      isActive: true,
    });

    return this.socialAccountRepository.save(account);
  }

  /**
   * Returns true if the user has at least one active connected account for the
   * given platform.  Used by ContentService to validate before scheduling.
   */
  async hasActiveAccount(userId: string, platform: string): Promise<boolean> {
    const count = await this.socialAccountRepository.count({
      where: { userId, platform: platform.toLowerCase(), isActive: true },
    });
    return count > 0;
  }

  async disconnectAccount(userId: string, accountId: string) {
    const account = await this.socialAccountRepository.findOne({
      where: { id: accountId, userId },
    });

    if (!account) {
      throw new NotFoundException('Social account not found');
    }

    await this.socialAccountRepository.softDelete({ id: accountId, userId } as any);

    return { success: true, message: 'Account disconnected successfully' };
  }

  async restoreAccount(userId: string, accountId: string) {
    const res = await this.socialAccountRepository.restore({ id: accountId, userId } as any);
    if (!res.affected) throw new NotFoundException('Social account not found');
    return this.socialAccountRepository.findOne({ where: { id: accountId, userId } });
  }

  async publishContent(userId: string, dto: PublishContentDto) {
    const account = await this.socialAccountRepository.findOne({
      where: { id: dto.accountId, userId },
    });

    if (!account) {
      throw new NotFoundException('Social account not found');
    }

    const content = await this.contentRepository.findOne({
      where: { id: dto.contentId, userId },
    });

    if (!content) {
      throw new NotFoundException('Content not found');
    }

    const accessToken = await this.getValidAccessToken(account);
    const platformPostId = await this.dispatchPublish(content, account, accessToken);

    await this.contentRepository.update(
      { id: content.id },
      {
        status: 'published',
        publishedAt: new Date(),
        platform: account.platform,
        metadata: {
          ...(content.metadata ?? {}),
          publish: {
            platform: account.platform,
            platformPostId,
            publishedAt: new Date().toISOString(),
            accountId: account.id,
            manual: true,
          },
        },
      },
    );

    // Seed an analytics row so the content appears in analytics queries
    await this.ensureAnalyticsRow(content.id);

    return {
      success: true,
      message: `Content published to ${account.platform} successfully`,
      contentId: content.id,
      platform: account.platform,
      platformPostId,
    };
  }

  // ─── Auto Publish (called by ContentSchedulerService) ─────────────────────

  async autoPublishScheduledContent(contentId: string): Promise<PublishResult> {
    const content = await this.contentRepository.findOne({
      where: { id: contentId },
    });

    if (!content) {
      throw new NotFoundException('Scheduled content not found');
    }

    if (!content.platform) {
      throw new BadRequestException(
        'Content has no platform set — cannot auto-publish',
      );
    }

    const account = await this.socialAccountRepository.findOne({
      where: {
        userId: content.userId,
        platform: content.platform,
        isActive: true,
      },
      order: { createdAt: 'DESC' },
    });

    if (!account) {
      throw new NotFoundException(
        `No active ${content.platform} account connected for user ${content.userId}`,
      );
    }

    // Refresh the token if it's expiring within 24 hours
    const accessToken = await this.getValidAccessToken(account);

    // Call the real platform API and get back the platform-side post ID
    const platformPostId = await this.dispatchPublish(content, account, accessToken);

    // Only mark published AFTER the API call succeeds, and only if the status
    // is still 'publishing' — a concurrent cancelSchedule may have reverted it
    // to 'draft' while the platform API call was in-flight.
    const result = await this.contentRepository.update(
      { id: content.id, status: 'publishing' },
      {
        status: 'published',
        publishedAt: new Date(),
        metadata: {
          ...(content.metadata ?? {}),
          publish: {
            platform: account.platform,
            platformPostId,
            publishedAt: new Date().toISOString(),
            accountId: account.id,
            autoPublished: true,
          },
        },
      },
    );

    if (!result.affected) {
      this.logger.warn(
        `Auto-publish for content ${content.id} succeeded on ${account.platform} ` +
          `(postId: ${platformPostId}) but status was no longer 'publishing' — DB update skipped.`,
      );
      return {
        success: true,
        contentId: content.id,
        accountId: account.id,
        platform: account.platform,
        platformPostId,
      };
    }

    this.logger.log(
      `Auto-published content ${content.id} to ${account.platform} — postId: ${platformPostId}`,
    );

    // Seed an analytics row so the content appears in analytics queries
    await this.ensureAnalyticsRow(content.id);

    return {
      success: true,
      contentId: content.id,
      accountId: account.id,
      platform: account.platform,
      platformPostId,
    };
  }

  // ─── Analytics row helper ─────────────────────────────────────────────────

  private async ensureAnalyticsRow(contentId: string) {
    try {
      const existing = await this.analyticsRepository.findOne({
        where: { contentId },
      });
      if (!existing) {
        await this.analyticsRepository.save(
          this.analyticsRepository.create({
            contentId,
            views: 0,
            likes: 0,
            shares: 0,
            comments: 0,
          }),
        );
      }
    } catch (err) {
      this.logger.warn(`Failed to seed analytics row for ${contentId}: ${err.message}`);
    }
  }

  // ─── Platform Dispatcher ──────────────────────────────────────────────────

  /**
   * Routes a content item to the correct platform publisher and returns the
   * platform-assigned post ID on success.
   */
  private async dispatchPublish(
    content: Content,
    account: SocialAccount,
    accessToken: string,
  ): Promise<string> {
    const platform = account.platform.toLowerCase();

    switch (platform) {
      case 'instagram':
        return this.publishToInstagram(content, accessToken);
      case 'facebook':
        return this.publishToFacebook(content, accessToken);
      default:
        throw new BadRequestException(
          `Auto-publish is not yet supported for "${account.platform}". ` +
            'Supported platforms: instagram, facebook.',
        );
    }
  }

  // ─── Instagram Publisher ──────────────────────────────────────────────────

  /**
   * Publishes to Instagram via the Meta Graph API.
   *
   * Flow:
   *   1. GET /me → resolve IG Business Account ID
   *   2. POST /{ig-account-id}/media → create container (image or video/reel)
   *   3. (Video only) Poll GET /{container-id}?fields=status_code until FINISHED
   *   4. POST /{ig-account-id}/media_publish → publish the container
   *
   * Requirements:
   *   - The stored access token must be a Page access token linked to an
   *     Instagram Business/Creator account (obtained via Facebook OAuth).
   *   - Image/video URLs must be publicly reachable by Meta's servers.
   */
  private async publishToInstagram(
    content: Content,
    accessToken: string,
  ): Promise<string> {
    // Resolve the Instagram Business Account ID
    const { data: me } = await axios
      .get(`${GRAPH_API}/me`, {
        params: { fields: 'id', access_token: accessToken },
      })
      .catch((err) => this.throwMetaError('resolving IG account ID', err));

    const igAccountId: string = me.id;
    const caption = (content.generatedText || content.prompt || '').trim();
    let creationId: string;

    if (content.generatedImage) {
      // ── Image post ──────────────────────────────────────────────────────
      const { data } = await axios
        .post(`${GRAPH_API}/${igAccountId}/media`, {
          image_url: content.generatedImage,
          caption,
          access_token: accessToken,
        })
        .catch((err) => this.throwMetaError('creating IG image container', err));

      creationId = data.id;
    } else if (content.generatedVideo) {
      // ── Video / Reel post ────────────────────────────────────────────────
      const { data } = await axios
        .post(`${GRAPH_API}/${igAccountId}/media`, {
          video_url: content.generatedVideo,
          media_type: 'REELS',
          caption,
          access_token: accessToken,
        })
        .catch((err) => this.throwMetaError('creating IG video container', err));

      creationId = data.id;
      // Video processing is asynchronous — wait for Meta to finish encoding
      await this.waitForInstagramMediaReady(creationId, accessToken);
    } else {
      // Instagram Graph API does not support text-only posts
      throw new BadRequestException(
        'Instagram requires an image or video. ' +
          'Text-only posts are not supported by the Meta Graph API.',
      );
    }

    // Publish the prepared media container
    const { data: published } = await axios
      .post(`${GRAPH_API}/${igAccountId}/media_publish`, {
        creation_id: creationId,
        access_token: accessToken,
      })
      .catch((err) => this.throwMetaError('publishing IG media container', err));

    return published.id;
  }

  /**
   * Polls the IG media container until Meta finishes processing the video.
   * Throws if it does not finish within `maxWaitMs` (default 3 minutes).
   */
  private async waitForInstagramMediaReady(
    creationId: string,
    accessToken: string,
    maxWaitMs = 180_000,
  ): Promise<void> {
    const pollMs = 5_000;
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      const { data } = await axios
        .get(`${GRAPH_API}/${creationId}`, {
          params: { fields: 'status_code', access_token: accessToken },
        })
        .catch((err) => this.throwMetaError('polling IG media status', err));

      if (data.status_code === 'FINISHED') return;

      if (data.status_code === 'ERROR') {
        throw new Error(
          `Instagram media processing failed (container ${creationId})`,
        );
      }

      // Status is IN_PROGRESS or PUBLISHED — keep waiting
      await new Promise((r) => setTimeout(r, pollMs));
    }

    throw new Error(
      `Instagram media processing timed out after ${maxWaitMs / 1000}s (container ${creationId})`,
    );
  }

  // ─── Facebook Publisher ───────────────────────────────────────────────────

  /**
   * Publishes to a Facebook Page via the Meta Graph API.
   *
   * Content-type routing:
   *   - Video  → POST /{page-id}/videos   with file_url + description
   *   - Image  → POST /{page-id}/photos   with url + caption
   *   - Text   → POST /{page-id}/feed     with message
   *
   * Requirements:
   *   - The stored access token must be a Page access token.
   *   - Image/video URLs must be publicly reachable by Meta's servers.
   */
  private async publishToFacebook(
    content: Content,
    accessToken: string,
  ): Promise<string> {
    // Resolve the Facebook Page ID from the token
    const { data: me } = await axios
      .get(`${GRAPH_API}/me`, {
        params: { fields: 'id', access_token: accessToken },
      })
      .catch((err) => this.throwMetaError('resolving FB page ID', err));

    const pageId: string = me.id;
    const message = (content.generatedText || content.prompt || '').trim();

    if (content.generatedVideo) {
      // ── Video post ───────────────────────────────────────────────────────
      const { data } = await axios
        .post(`${GRAPH_API}/${pageId}/videos`, {
          file_url: content.generatedVideo,
          description: message,
          access_token: accessToken,
        })
        .catch((err) => this.throwMetaError('posting FB video', err));

      return data.id;
    }

    if (content.generatedImage) {
      // ── Photo post ───────────────────────────────────────────────────────
      const { data } = await axios
        .post(`${GRAPH_API}/${pageId}/photos`, {
          url: content.generatedImage,
          caption: message,
          access_token: accessToken,
        })
        .catch((err) => this.throwMetaError('posting FB photo', err));

      // Facebook returns both post_id (the feed post) and id (the photo object)
      return data.post_id ?? data.id;
    }

    if (message) {
      // ── Text-only post ───────────────────────────────────────────────────
      const { data } = await axios
        .post(`${GRAPH_API}/${pageId}/feed`, {
          message,
          access_token: accessToken,
        })
        .catch((err) => this.throwMetaError('posting FB text', err));

      return data.id;
    }

    throw new BadRequestException(
      'No publishable content found for Facebook (requires image, video, or text)',
    );
  }

  // ─── Token Management ─────────────────────────────────────────────────────

  /**
   * Returns the current access token for the account, automatically refreshing
   * it if it expires within the next 24 hours.
   *
   * Meta long-lived tokens last 60 days.  The refresh endpoint exchanges any
   * unexpired long-lived token for a fresh 60-day token.
   */
  private async getValidAccessToken(account: SocialAccount): Promise<string> {
    const now = new Date();
    const refreshThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Token is still valid for > 24h or has no expiry set — use as-is
    if (!account.expiresAt || new Date(account.expiresAt) > refreshThreshold) {
      return account.accessToken;
    }

    const platform = account.platform.toLowerCase();

    // Only Meta platforms (FB + IG) support the fb_exchange_token grant
    if (platform !== 'facebook' && platform !== 'instagram') {
      this.logger.warn(
        `Token for ${account.platform} account ${account.id} is expiring soon but refresh is not supported`,
      );
      return account.accessToken;
    }

    const appId = this.configService.get<string>('FACEBOOK_APP_ID');
    const appSecret = this.configService.get<string>('FACEBOOK_APP_SECRET');

    if (!appId || !appSecret) {
      this.logger.warn(
        'FACEBOOK_APP_ID or FACEBOOK_APP_SECRET not set — skipping token refresh',
      );
      return account.accessToken;
    }

    try {
      const { data } = await axios.get(`${GRAPH_API}/oauth/access_token`, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: account.accessToken,
        },
      });

      const newToken: string = data.access_token;
      const newExpiresAt = data.expires_in
        ? new Date(now.getTime() + Number(data.expires_in) * 1000)
        : new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // default 60 days

      await this.socialAccountRepository.update(
        { id: account.id },
        { accessToken: newToken, expiresAt: newExpiresAt },
      );

      this.logger.log(
        `Refreshed access token for ${account.platform} account ${account.id}`,
      );
      return newToken;
    } catch (err: any) {
      // Log but don't throw — fall back to existing token.
      // If it's truly expired the platform API call will throw and the scheduler
      // will handle the retry / failure lifecycle.
      this.logger.warn(
        `Token refresh failed for account ${account.id}: ` +
          (err?.response?.data?.error?.message ?? err?.message),
      );
      return account.accessToken;
    }
  }

  // ─── Error Helper ─────────────────────────────────────────────────────────

  /**
   * Extracts the human-readable error message from a Meta Graph API error
   * response and re-throws it as a typed Error so the scheduler can log it.
   */
  private throwMetaError(context: string, err: unknown): never {
    const axErr = err as AxiosError<any>;
    const metaMsg =
      axErr?.response?.data?.error?.message ??
      axErr?.message ??
      'Unknown Meta API error';
    const code = axErr?.response?.data?.error?.code;
    const msg = code
      ? `Meta API error while ${context} (code ${code}): ${metaMsg}`
      : `Meta API error while ${context}: ${metaMsg}`;
    this.logger.error(msg);
    throw new Error(msg);
  }

  // ─── Supported Platforms ──────────────────────────────────────────────────

  getSupportedPlatforms() {
    return [
      {
        id: 'instagram',
        name: 'Instagram',
        icon: 'instagram',
        description: 'Share photos and stories',
        requiresAuth: true,
      },
      {
        id: 'facebook',
        name: 'Facebook',
        icon: 'facebook',
        description: 'Post to your page or profile',
        requiresAuth: true,
      },
      {
        id: 'twitter',
        name: 'Twitter (X)',
        icon: 'twitter',
        description: 'Share tweets and threads',
        requiresAuth: true,
      },
      {
        id: 'linkedin',
        name: 'LinkedIn',
        icon: 'linkedin',
        description: 'Professional network posts',
        requiresAuth: true,
      },
      {
        id: 'tiktok',
        name: 'TikTok',
        icon: 'tiktok',
        description: 'Short-form video content',
        requiresAuth: true,
      },
    ];
  }

  // ─── OAuth / Account Connection ───────────────────────────────────────────

  async handleFacebookCallback(query: any) {
    const longLived = query.long_lived_token;
    if (!longLived) return { message: 'No token received' };

    const pages = await axios.get(`${GRAPH_API}/me/accounts`, {
      params: {
        fields: 'id,name,access_token,instagram_business_account',
        access_token: longLived,
      },
    });

    return {
      longLivedToken: longLived,
      pages: pages.data.data,
    };
  }

  async handleOAuthCallback(userId: string, dto: OAuthCallbackDto) {
    try {
      let tokenData: any;
      let accountName: string;

      switch (dto.platform) {
        case 'instagram':
          tokenData = await this.exchangeInstagramCode(dto.code, dto.redirectUri);
          accountName = tokenData.username || 'Instagram User';
          break;

        case 'facebook':
          tokenData = await this.exchangeFacebookCode(dto.code, dto.redirectUri);
          accountName = tokenData.name || 'Facebook User';
          break;

        case 'linkedin':
          tokenData = await this.exchangeLinkedInCode(dto.code, dto.redirectUri);
          accountName = tokenData.name || 'LinkedIn User';
          break;

        case 'google':
          tokenData = await this.exchangeGoogleCode(dto.code, dto.redirectUri);
          accountName = tokenData.email || 'Google User';
          break;

        default:
          throw new BadRequestException(`Unsupported platform: ${dto.platform}`);
      }

      const existing = await this.socialAccountRepository.findOne({
        where: { userId, platform: dto.platform },
      });

      if (existing) {
        existing.accessToken = tokenData.access_token;
        existing.refreshToken = tokenData.refresh_token;
        existing.expiresAt = tokenData.expires_at;
        existing.accountName = accountName;
        existing.isActive = true;
        return this.socialAccountRepository.save(existing);
      }

      const account = this.socialAccountRepository.create({
        userId,
        platform: dto.platform,
        accountName,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_at,
        isActive: true,
      });
      return this.socialAccountRepository.save(account);
    } catch (error: any) {
      console.error('OAuth callback error:', error);
      throw new BadRequestException(
        `Failed to connect ${dto.platform}: ${error.message}`,
      );
    }
  }

  // ─── OAuth Code Exchange (private) ───────────────────────────────────────

  private async exchangeInstagramCode(code: string, redirectUri: string) {
    const clientId = this.configService.get('INSTAGRAM_CLIENT_ID');
    const clientSecret = this.configService.get('INSTAGRAM_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return {
        access_token: 'mock_instagram_token_' + Date.now(),
        refresh_token: 'mock_refresh_token',
        expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        username: 'demo_instagram_user',
      };
    }

    const response = await axios.post('https://api.instagram.com/oauth/access_token', {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    });

    return {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_at: new Date(Date.now() + response.data.expires_in * 1000),
      username: response.data.user?.username,
    };
  }

  private async exchangeFacebookCode(code: string, redirectUri: string) {
    const clientId = this.configService.get('FACEBOOK_APP_ID');
    const clientSecret = this.configService.get('FACEBOOK_APP_SECRET');

    if (!clientId || !clientSecret) {
      return {
        access_token: 'mock_facebook_token_' + Date.now(),
        refresh_token: null,
        expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        name: 'demo_facebook_user',
      };
    }

    const response = await axios.get(`${GRAPH_API}/oauth/access_token`, {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      },
    });

    return {
      access_token: response.data.access_token,
      refresh_token: null,
      expires_at: new Date(Date.now() + response.data.expires_in * 1000),
      name: 'Facebook User',
    };
  }

  private async exchangeLinkedInCode(code: string, redirectUri: string) {
    const clientId = this.configService.get('LINKEDIN_CLIENT_ID');
    const clientSecret = this.configService.get('LINKEDIN_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return {
        access_token: 'mock_linkedin_token_' + Date.now(),
        refresh_token: 'mock_refresh_token',
        expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        name: 'demo_linkedin_user',
      };
    }

    const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
      params: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      },
    });

    return {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_at: new Date(Date.now() + response.data.expires_in * 1000),
      name: 'LinkedIn User',
    };
  }

  private async exchangeGoogleCode(code: string, redirectUri: string) {
    const clientId = this.configService.get('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return {
        access_token: 'mock_google_token_' + Date.now(),
        refresh_token: 'mock_refresh_token',
        expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        email: 'demo@google.com',
      };
    }

    const response = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    return {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_at: new Date(Date.now() + response.data.expires_in * 1000),
      email: 'Google User',
    };
  }
}
