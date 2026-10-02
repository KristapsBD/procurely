import { execSync } from 'node:child_process';

/**
 * Mutation runs execute the HTTP suite once per mutant against one shared database, and the
 * suite is not repeatable on a used database, so reset and seed it before every run.
 */
export default function resetDatabase(): void {
  execSync('pnpm db:reset', { cwd: `${__dirname}/..`, stdio: 'ignore' });
}
