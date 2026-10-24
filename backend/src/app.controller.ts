import { Controller, Get } from '@nestjs/common';

/** Landing response for anyone who opens the API root in a browser. */
@Controller()
export class AppController {
  @Get()
  index() {
    return {
      status: 'ok',
      service: 'Pickup Counter API',
      customerScreen: 'http://localhost:8080',
      endpoints: [
        'GET  /products',
        'POST /orders',
        'GET  /orders/:id',
        'POST /orders/:id/pickup-claim',
        'POST /payments/webhook',
      ],
    };
  }
}
