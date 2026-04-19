import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  checkHealth() {
    return {
      status: 'ok',
      message: 'Backend API is up and running!',
      timestamp: new Date().toISOString()
    };
  }
}
