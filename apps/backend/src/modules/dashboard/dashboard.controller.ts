import { Controller, Get, Post, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Param, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('admin/inteligencia')
  getAdminInteligencia(@CurrentUser() user: any, @Query('year') year?: string) {
    return this.dashboardService.getAdminInteligencia(user, year);
  }

  @Get('catalog')
  listDashboards(@CurrentUser() user: any) {
    return this.dashboardService.listDashboards(user);
  }

  @Get('catalog/:dashboardId')
  getDashboardMeta(@CurrentUser() user: any, @Param('dashboardId') dashboardId: string) {
    return this.dashboardService.getDashboardMeta(user, dashboardId);
  }

  @Get('overview')
  getOverview(@CurrentUser() user: any, @Query('dashboardId') dashboardId?: string, @Query('month') month?: string) {
    return this.dashboardService.getOverview(user, dashboardId, month);
  }

  @Get('units')
  getUnits(@CurrentUser() user: any, @Query('dashboardId') dashboardId?: string, @Query('month') month?: string) {
    return this.dashboardService.getUnits(user, dashboardId, month);
  }

  @Get('costs')
  getCosts(@CurrentUser() user: any, @Query('dashboardId') dashboardId?: string, @Query('month') month?: string) {
    return this.dashboardService.getCosts(user, dashboardId, month);
  }

  @Get('managers')
  getManagers(@CurrentUser() user: any, @Query('dashboardId') dashboardId?: string, @Query('month') month?: string) {
    return this.dashboardService.getManagers(user, dashboardId, month);
  }

  @Get('trends')
  getTrends(@CurrentUser() user: any, @Query('dashboardId') dashboardId?: string, @Query('month') month?: string) {
    return this.dashboardService.getTrends(user, dashboardId, month);
  }

  @Get('people')
  getPeople(@CurrentUser() user: any, @Query('dashboardId') dashboardId?: string, @Query('month') month?: string) {
    return this.dashboardService.getPeople(user, dashboardId, month);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
    @Query('dashboardId') dashboardId?: string,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    return this.dashboardService.importExcel(file.buffer, user, dashboardId);
  }
}
