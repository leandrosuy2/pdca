import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DataEntryService } from './data-entry.service';

@UseGuards(JwtAuthGuard)
@Controller('data-entry')
export class DataEntryController {
  constructor(private readonly dataEntryService: DataEntryService) {}

  @Get('context')
  getContext(@CurrentUser() user: any) {
    return this.dataEntryService.getContext(user);
  }

  @Get('monthly')
  getMonthlyInput(
    @CurrentUser() user: any,
    @Query('unitId') unitId: string,
    @Query('month') month: string,
  ) {
    return this.dataEntryService.getMonthlyInput(user, unitId, month);
  }

  @Get('launches')
  getLaunches(@CurrentUser() user: any, @Query('dashboardId') dashboardId?: string) {
    return this.dataEntryService.getLaunches(user, dashboardId);
  }

  @Post('monthly')
  saveMonthlyInput(@CurrentUser() user: any, @Body() payload: Record<string, any>) {
    return this.dataEntryService.saveMonthlyInput(user, payload);
  }
}
