import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

export class PaymentWebhookDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  eventId: string;

  @IsString()
  @MaxLength(200)
  orderId: string;

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  amountPaise: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  status: string;
}
