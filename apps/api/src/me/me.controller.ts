import {
  Controller,
  Get,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { MeResponse } from '@procurely/shared-types';
import { SessionGuard } from '../auth/session.guard';
import { Scope, type RequestScope } from '../tenancy/request-scope';
import { TenantDb } from '../tenancy/tenant-db.service';

@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  constructor(private readonly db: TenantDb) {}

  @Get()
  async me(@Scope() scope: RequestScope): Promise<MeResponse> {
    const person = await this.db.run(scope, (tx) =>
      tx.person.findUnique({
        where: { id: scope.personId },
        include: { memberships: { include: { company: true } } },
      }),
    );
    if (!person) throw new UnauthorizedException();
    return {
      id: person.id,
      email: person.email,
      name: person.name,
      memberships: person.memberships.map((m) => ({
        companyId: m.companyId,
        companyName: m.company.name,
        currency: m.company.currency,
        role: m.role,
      })),
    };
  }
}
