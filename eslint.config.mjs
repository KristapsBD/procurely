import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/generated/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: { complexity: ['error', 10] },
  },
  // Request handlers reach the database only through TenantDb.run (tenancy module), which sets
  // the current user and company before any query. Only wiring, the tenancy module and the
  // health check (SELECT 1, no tenant data) may touch the raw Prisma client or PrismaService.
  {
    files: ['apps/api/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              message:
                'Use TenantDb.run from src/tenancy instead of the raw Prisma client.',
              allowTypeImports: true,
            },
          ],
          patterns: [
            {
              group: ['**/prisma.service'],
              message:
                'Use TenantDb.run from src/tenancy instead of PrismaService.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'apps/api/src/tenancy/**',
      'apps/api/src/prisma.service.ts',
      'apps/api/src/app.module.ts',
      'apps/api/src/health/**',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
);
