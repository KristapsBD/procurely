import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import {
  InviteMemberRequest,
  Member,
  UpdateMemberRequest,
} from '../contract/api.dto';
import { ApiCompanyHeader } from '../contract/decorators';
import { SessionGuard } from '../auth/session.guard';
import { translateDbError } from '../tenancy/db-errors';
import {
  CompanyScope,
  type CompanyRequestScope,
} from '../tenancy/request-scope';
import { TenantDb } from '../tenancy/tenant-db.service';
import { parseInvite, parseUpdate } from './member-input';
import { MembersService } from './members.service';

@Controller('members')
@UseGuards(SessionGuard)
@ApiBearerAuth()
@ApiCompanyHeader()
export class MembersController {
  constructor(
    private readonly db: TenantDb,
    private readonly members: MembersService,
  ) {}

  /** An admin sees the whole company roster; anyone else sees at most their own membership. */
  @Get()
  list(@CompanyScope() scope: CompanyRequestScope): Promise<Member[]> {
    return this.db.run(scope, (tx) => this.members.list(tx, scope));
  }

  @Post()
  invite(
    @CompanyScope() scope: CompanyRequestScope,
    @Body() body: InviteMemberRequest,
  ): Promise<Member> {
    const input = parseInvite(body);
    return this.db
      .run(scope, (tx) => this.members.invite(tx, scope, input))
      .catch(translateDbError);
  }

  @Patch(':id')
  update(
    @CompanyScope() scope: CompanyRequestScope,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateMemberRequest,
  ): Promise<Member> {
    const input = parseUpdate(body);
    return this.db
      .run(scope, (tx) => this.members.update(tx, scope, id, input))
      .catch(translateDbError);
  }
}
