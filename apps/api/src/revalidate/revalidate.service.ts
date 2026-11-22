import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RevalidateInput {
  paths?: string[];
  tags?: string[];
}

// Calls the web app's protected POST /api/revalidate after an event that
// changes what a cached page would show. Never throws — every caller
// (report transitions, model activate/deactivate, recomputeScore, Notice
// decisions) fires this as a side effect that must not break the main
// operation if the web app is down, misconfigured, or slow. See
// CLAUDE.md's "On-demand revalidation" section for the tag/path mapping.
@Injectable()
export class RevalidateService {
  private readonly logger = new Logger(RevalidateService.name);

  constructor(private readonly config: ConfigService) {}

  async revalidate(input: RevalidateInput): Promise<void> {
    const secret = this.config.get<string>('REVALIDATE_SECRET');
    if (!secret) {
      // Not configured — expected in local dev/e2e unless explicitly set up.
      return;
    }
    if (!input.paths?.length && !input.tags?.length) return;

    const webOrigin = this.config.get<string>('WEB_ORIGIN');
    try {
      const res = await fetch(`${webOrigin}/api/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': secret },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        this.logger.warn(`Revalidate isteği ${res.status} döndü: ${JSON.stringify(input)}`);
      }
    } catch (error) {
      this.logger.error(
        `Revalidate isteği atılamadı: ${JSON.stringify(input)}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
