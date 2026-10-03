import { Module } from '@nestjs/common';
import { AuditLogController } from './audit/audit-log.controller';
import { AuthController } from './auth/auth.controller';
import { SessionGuard } from './auth/session.guard';
import { SessionTokens } from './auth/session-tokens';
import { APP_CONFIG, loadConfig } from './config';
import { CatalogItemsController } from './catalog/catalog-items.controller';
import { CatalogItemsService } from './catalog/catalog-items.service';
import { CompaniesController } from './companies/companies.controller';
import { CostCentersController } from './cost-centers/cost-centers.controller';
import { HealthController } from './health/health.controller';
import { MeController } from './me/me.controller';
import { MembersController } from './members/members.controller';
import { MembersService } from './members/members.service';
import { PrismaService } from './prisma.service';
import { SuppliersController } from './suppliers/suppliers.controller';
import { SuppliersService } from './suppliers/suppliers.service';
import { TenantDb } from './tenancy/tenant-db.service';

@Module({
  controllers: [
    HealthController,
    AuthController,
    MeController,
    CostCentersController,
    CompaniesController,
    MembersController,
    AuditLogController,
    SuppliersController,
    CatalogItemsController,
  ],
  providers: [
    PrismaService,
    TenantDb,
    MembersService,
    SuppliersService,
    CatalogItemsService,
    SessionTokens,
    SessionGuard,
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
  ],
})
export class AppModule {}
