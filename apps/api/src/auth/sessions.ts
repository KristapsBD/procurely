import { Injectable } from '@nestjs/common';
import type { SessionResponse } from '../contract/api.dto';
import { TenantDb } from '../tenancy/tenant-db.service';
import { SessionTokens } from './session-tokens';

/** Starts a session for a person, however they proved who they are. */
@Injectable()
export class Sessions {
  constructor(
    private readonly db: TenantDb,
    private readonly tokens: SessionTokens,
  ) {}

  /** Null when the person does not exist. */
  async start(personId: string): Promise<SessionResponse | null> {
    // Under RLS a person can read only their own row, so this doubles as an existence check.
    const person = await this.db.run({ personId, companyId: null }, (tx) =>
      tx.person.findUnique({ where: { id: personId } }),
    );
    if (!person) return null;
    return {
      token: this.tokens.issue(person.id),
      person: { id: person.id, email: person.email, name: person.name },
    };
  }
}
