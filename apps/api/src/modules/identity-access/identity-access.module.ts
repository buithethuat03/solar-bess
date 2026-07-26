import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuditEventEntity, AuthenticationSessionEntity, DelegationEntity, LocalCredentialEntity,
  PackageEntity, ProjectEntity, RoleAssignmentEntity, RoleEntity, TenantEntity, UserAccountEntity
} from '../../database/entities';
import { AccessGuard } from './access.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { IdentityAdminController } from './identity-admin.controller';
import { IdentityAdminService } from './identity-admin.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { PermissionGuard } from './permission.guard';
import { PermissionService } from './permission.service';
import { OperationalFoundationModule } from '../operational-foundation/operational-foundation.module';
import { UserDirectoryController } from './user-directory.controller';
import { UserDirectoryService } from './user-directory.service';

@Module({
  imports: [
    JwtModule.register({}),
    OperationalFoundationModule,
    TypeOrmModule.forFeature([
      TenantEntity, UserAccountEntity, LocalCredentialEntity,
      AuthenticationSessionEntity, AuditEventEntity, RoleAssignmentEntity, RoleEntity,
      ProjectEntity, PackageEntity, DelegationEntity
    ])
  ],
  controllers: [AuthController, UserDirectoryController, IdentityAdminController],
  providers: [
    AuthService, TokenService, PasswordService, LoginRateLimitService,
    AccessGuard, PermissionService, PermissionGuard, UserDirectoryService, IdentityAdminService
  ],
  exports: [AuthService, AccessGuard, PermissionService, PermissionGuard]
})
export class IdentityAccessModule {}
