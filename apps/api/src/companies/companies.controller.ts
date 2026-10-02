import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CompanyMembership } from '../contract/api.dto';
import { ApiCompanyHeader } from '../contract/decorators';
import { SessionGuard } from '../auth/session.guard';
import {
  CompanyScope,
  Scope,
  type CompanyRequestScope,
  type RequestScope,
} from '../tenancy/request-scope';
import { TenantDb } from '../tenancy/tenant-db.service';

type MembershipWithCompany = {
  companyId: string;
  role: CompanyMembership['role'];
  company: { name: string; currency: string };
};

function toCompanyMembership(m: MembershipWithCompany): CompanyMembership {
  return {
    companyId: m.companyId,
    companyName: m.company.name,
    currency: m.company.currency,
    role: m.role,
  };
}

/**
 * The company a request acts in is not server-side state: the client names it in the
 * X-Company-Id header on every request and the database checks it against active memberships.
 * These routes let a client list its choices and confirm a selection before using it.
 */
@Controller('companies')
@UseGuards(SessionGuard)
@ApiBearerAuth()
export class CompaniesController {
  constructor(private readonly db: TenantDb) {}

  /** The companies the person actively belongs to, with their role in each. */
  @Get()
  async list(@Scope() scope: RequestScope): Promise<CompanyMembership[]> {
    const rows = await this.db.run(scope, (tx) =>
      tx.membership.findMany({
        where: { personId: scope.personId, active: true },
        include: { company: true },
        orderBy: { company: { name: 'asc' } },
      }),
    );
    return rows.map(toCompanyMembership);
  }

  /** Confirms the company named in the header: the person's role in it, or 404. */
  @Get('active')
  @ApiCompanyHeader()
  async active(
    @CompanyScope() scope: CompanyRequestScope,
  ): Promise<CompanyMembership> {
    const row = await this.db.run(scope, (tx) =>
      tx.membership.findFirst({
        where: {
          personId: scope.personId,
          companyId: scope.companyId,
          active: true,
        },
        include: { company: true },
      }),
    );
    if (!row) throw new NotFoundException();
    return toCompanyMembership(row);
  }
}
