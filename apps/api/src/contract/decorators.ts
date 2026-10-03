import { ApiHeader, ApiQuery } from '@nestjs/swagger';
import { COMPANY_HEADER } from '@procurely/shared-types';

/** Documents the company header that routes using `CompanyScope` require. */
export const ApiCompanyHeader = () =>
  ApiHeader({
    name: COMPANY_HEADER,
    required: true,
    description: 'The company the person acts in (a company UUID).',
  });

/** Documents the `selectable` filter of lists that offer records for new work. */
export const ApiSelectableQuery = (what: string) =>
  ApiQuery({
    name: 'selectable',
    required: false,
    enum: ['true'],
    description: `Only ${what} that may be chosen for new work.`,
  });
