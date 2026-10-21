import { CanActivate, ExecutionContext, Inject, Injectable, RawBodyRequest, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { APP_CONFIG, AppConfig } from '../../../config/config';
import { isValidSignature } from '../signature';

/**
 * Checks X-Signature against the raw body before anything else runs. Guards run before
 * validation pipes, so an unsigned request is rejected without its body being looked at.
 */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    if (!req.rawBody || !isValidSignature(this.config.webhookSecret, req.rawBody, req.header('x-signature'))) {
      throw new UnauthorizedException({ code: 'INVALID_SIGNATURE', message: 'Webhook signature does not match' });
    }
    return true;
  }
}
