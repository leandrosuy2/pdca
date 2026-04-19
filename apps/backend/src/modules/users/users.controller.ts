import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('summary')
  getUsersSummary(@CurrentUser() user: any) {
    return this.usersService.getUsersSummary(user);
  }

  @Get(':id/detail')
  getUserDetail(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.getUserDetail(user, id);
  }

  @Get()
  listUsers(@CurrentUser() user: any) {
    return this.usersService.listUsers(user);
  }

  @Post()
  createUser(@CurrentUser() user: any, @Body() payload: Record<string, any>) {
    return this.usersService.createUser(user, payload);
  }

  @Post(':id/clear-dashboard-data')
  clearDashboardData(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.clearUserDashboardData(user, id);
  }
}
