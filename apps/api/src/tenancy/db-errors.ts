import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Turns database errors into HTTP errors. An RLS rejection is a Postgres 'new row violates row-level security policy' error. */
export function translateDbError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw new ConflictException('Already exists');
    if (error.code === 'P2025') throw new NotFoundException();
  }
  if (String(error).includes('row-level security')) {
    throw new ForbiddenException('Not allowed in this company');
  }
  throw error;
}
