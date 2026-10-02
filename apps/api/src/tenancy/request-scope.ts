import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { COMPANY_HEADER } from '@procurely/shared-types';
import { isUuid } from './uuid';

/** Who is asking and which company they act in. The database verifies both. */
export interface RequestScope {
  personId: string;
  companyId: string | null;
}

export interface AuthedRequest extends Request {
  personId?: string;
}

function readCompanyId(req: Request): string | null {
  const header = req.headers[COMPANY_HEADER];
  if (header === undefined) return null;
  if (!isUuid(header)) {
    throw new BadRequestException(`${COMPANY_HEADER} must be a UUID`);
  }
  return header;
}

/** The person (from the session) and the optional company header. */
export const Scope = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestScope => {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    return { personId: req.personId as string, companyId: readCompanyId(req) };
  },
);

/** Like Scope, but the company header is mandatory. */
export const CompanyScope = createParamDecorator(
  (
    _data: unknown,
    context: ExecutionContext,
  ): RequestScope & {
    companyId: string;
  } => {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const companyId = readCompanyId(req);
    if (!companyId) {
      throw new BadRequestException(`${COMPANY_HEADER} header is required`);
    }
    return { personId: req.personId as string, companyId };
  },
);
