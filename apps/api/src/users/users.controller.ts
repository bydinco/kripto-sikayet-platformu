import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { SetRoleDto } from './dto/set-role.dto.js';
import { DeleteSelfDto } from './dto/delete-self.dto.js';
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

  // Self-service account deletion — requires your own current password.
  // Registered before ':id' below so Nest/Express doesn't try to match
  // "me" as an :id param.
  @Delete('me')
  @HttpCode(200)
  async removeSelf(@Body() dto: DeleteSelfDto, @CurrentUser() currentUser: JwtPayload) {
    await this.usersService.deleteSelf(currentUser, dto.password);
    return { deleted: true };
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

  // ADMIN only. Validity of `role` itself is enforced by SetRoleDto's
  // @IsEnum(Role) (unknown value -> 400); ownership/last-admin rules are
  // in UsersService.setRole (self -> 403, last ADMIN demoted -> 409).
  @Roles(Role.ADMIN)
  @Patch(':id/role')
  async setRole(
    @Param('id') id: string,
    @Body() dto: SetRoleDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    const user = await this.usersService.setRole(id, dto.role, currentUser);
    return toUserResponse(user, true);
  }

  // ADMIN-initiated deletion of someone else's account. For your own
  // account, use DELETE /users/me instead (password-confirmed).
  @Roles(Role.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() currentUser: JwtPayload) {
    await this.usersService.deleteByAdmin(id, currentUser);
    return { deleted: true };
  }

  private assertSelfOrAdmin(targetId: string, currentUser: JwtPayload) {
    if (currentUser.role !== Role.ADMIN && currentUser.sub !== targetId) {
      throw new ForbiddenException('Sadece kendi profilinize erişebilirsiniz.');
    }
  }
}
