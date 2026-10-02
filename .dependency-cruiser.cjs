/**
 * Dependency-boundary rules, checked by `pnpm deps:check` (CI job `dependency-boundaries`).
 * The rule that only the tenancy module may touch the raw database client is enforced by ESLint
 * (`no-restricted-imports` in eslint.config.mjs) and is not repeated here.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Circular dependencies make modules impossible to reason about in isolation.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'shared-types-is-a-leaf',
      severity: 'error',
      comment:
        'packages/shared-types is imported by the apps; it must not import from apps or other workspace packages.',
      from: { path: '^packages/shared-types/' },
      to: { path: '^(apps/|packages/(?!shared-types/))' },
    },
    {
      name: 'apps-do-not-import-each-other',
      severity: 'error',
      comment:
        'apps/api and apps/mobile talk over HTTP and share only packages/shared-types.',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'src-does-not-import-tests',
      severity: 'error',
      comment: 'Production code must not depend on test code.',
      from: { path: '^apps/[^/]+/src/' },
      to: { path: '^apps/[^/]+/test/' },
    },
    {
      name: 'src-does-not-import-scripts',
      severity: 'error',
      comment: 'Production code must not depend on dev scripts or seed data.',
      from: { path: '^apps/[^/]+/src/' },
      to: { path: '^apps/[^/]+/(scripts|prisma)/' },
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment:
        'Production code must not import packages that are only devDependencies.',
      from: {
        path: '^(apps|packages)/[^/]+/src/',
        pathNot: '\\.(spec|test)\\.ts$',
      },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    exclude: { path: '/(generated|dist|coverage|[.]stryker-tmp)/' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
