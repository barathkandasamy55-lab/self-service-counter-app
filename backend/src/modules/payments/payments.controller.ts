import { Body, Controller, HttpCode, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { PaymentWebhookDto, WebhookResultDto } from './dto';
import { WebhookSignatureGuard } from './guards/webhook-signature.guard';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Always 200 once the signature and shape are valid, so the provider stops retrying. */
  @Post('webhook')
  @HttpCode(200)
  @UseGuards(WebhookSignatureGuard)
  handleWebhook(@Body() event: PaymentWebhookDto, @Req() req: RawBodyRequest<Request>): Promise<WebhookResultDto> {
    return this.payments.handle(event, req.rawBody!.toString('utf8'));
  }
}
