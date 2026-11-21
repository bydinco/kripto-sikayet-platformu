import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';
import { toUserResponse } from './user-response.util.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(Role.ADMIN)
  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    const user = await this.usersService.create(createUserDto);
    return toUserResponse(user, true);
  }

  @Roles(Role.ADMIN)
  @Get()
  async findAll() {
    const users = await this.usersService.findAll();
    return users.map((user) => toUserResponse(user, true));
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() currentUser: JwtPayload) {
    this.assertSelfOrAdmin(id, currentUser);
    const user = await this.usersService.findOne(id);
    return user && toUserResponse(user, true);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    this.assertSelfOrAdmin(id, currentUser);
    const user = await this.usersService.update(id, updateUserDto);
    return toUserResponse(user, true);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  private assertSelfOrAdmin(targetId: string, currentUser: JwtPayload) {
    if (currentUser.role !== Role.ADMIN && currentUser.sub !== targetId) {
      throw new ForbiddenException('Sadece kendi profilinize erişebilirsiniz.');
    }
  }
}
