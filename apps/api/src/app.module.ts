import { Module } from '@nestjs/common';
import { AuditLogController } from './audit/audit-log.controller';
import { AuthController } from './auth/auth.controller';
import { GoogleAuthController } from './auth/google-auth.controller';
import { GOOGLE_ENDPOINTS, googleEndpoints } from './auth/google-endpoints';
import { GoogleSignIn } from './auth/google-sign-in.service';
import { SessionGuard } from './auth/session.guard';
import { SessionTokens } from './auth/session-tokens';
import { Sessions } from './auth/sessions';
import { APP_CONFIG, loadConfig, type AppConfig } from './config';
import { CatalogItemsController } from './catalog/catalog-items.controller';
import { CatalogItemsService } from './catalog/catalog-items.service';
import { CompaniesController } from './companies/companies.controller';
import { CostCentersController } from './cost-centers/cost-centers.controller';
import { HealthController } from './health/health.controller';
import { MeController } from './me/me.controller';
import { MembersController } from './members/members.controller';
import { MembersService } from './members/members.service';
import { PrismaService } from './prisma.service';
import { RequisitionsController } from './requisitions/requisitions.controller';
import { RequisitionsService } from './requisitions/requisitions.service';
import { SuppliersController } from './suppliers/suppliers.controller';
import { SuppliersService } from './suppliers/suppliers.service';
import { TenantDb } from './tenancy/tenant-db.service';

@Module({
  controllers: [
    HealthController,
    AuthController,
    GoogleAuthController,
    MeController,
    CostCentersController,
    CompaniesController,
    MembersController,
    AuditLogController,
    SuppliersController,
    CatalogItemsController,
    RequisitionsController,
  ],
  providers: [
    PrismaService,
    TenantDb,
    MembersService,
    SuppliersService,
    CatalogItemsService,
    RequisitionsService,
    SessionTokens,
    Sessions,
    SessionGuard,
    GoogleSignIn,
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    {
      provide: GOOGLE_ENDPOINTS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.google ? googleEndpoints(config.google) : null,
    },
  ],
})
export class AppModule {}
