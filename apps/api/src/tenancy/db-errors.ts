import {
  BadRequestException,
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
    // A foreign key found no row. Keys that name another record also carry the company, so
    // another company's record is reported exactly like one that does not exist.
    if (error.code === 'P2003') {
      throw new BadRequestException('Refers to a record that does not exist');
    }
  }
  // The goods receipt triggers refuse what a concurrent writer made impossible after the
  // service's own check.
  if (
    /over-receiving|cannot correct below zero|purchase order is closed|not fully received/.test(
      String(error),
    )
  ) {
    throw new ConflictException('The order changed: reload and try again');
  }
  if (String(error).includes('row-level security')) {
    throw new ForbiddenException('Not allowed in this company');
  }
  throw error;
}
