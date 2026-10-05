import { PrismaClient } from '@prisma/client';

// Structural RLS audit. Fails (exit 1) unless
//  1. every table in the public schema has RLS enabled and forced,
//  2. every table with a company_id column has at least one policy,
//  3. the API role cannot bypass RLS (not superuser, no BYPASSRLS, owns nothing, inherits nothing),
//  4. append-only tables (audit_log, requisition_decisions) have no update/delete/truncate
//     privilege for the API role and no update, delete or catch-all policy,
//  5. connected as the API role with no identity set, every table is empty to it
//     even though the (seeded) tables hold rows.
// DIRECT_URL is the database owner, DATABASE_URL the API role. Run after the seed is loaded.
const NOT_AUDITED = ['_prisma_migrations'];
// Tables the API may only insert into and select from, never change.
const APPEND_ONLY = ['audit_log', 'requisition_decisions'];

interface TableRow {
  table: string;
  enabled: boolean;
  forced: boolean;
  scoped: boolean;
  policies: number;
}

async function auditTables(owner: PrismaClient): Promise<string[]> {
  const tables = await owner.$queryRaw<TableRow[]>`
    SELECT c.relname AS "table",
           c.relrowsecurity AS enabled,
           c.relforcerowsecurity AS forced,
           EXISTS (SELECT 1 FROM information_schema.columns col
                   WHERE col.table_schema = 'public' AND col.table_name = c.relname
                     AND col.column_name = 'company_id') AS scoped,
           (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY c.relname`;
  const failures: string[] = [];
  for (const t of tables.filter((t) => !NOT_AUDITED.includes(t.table))) {
    if (!t.enabled) failures.push(`${t.table}: RLS is not enabled`);
    if (!t.forced) failures.push(`${t.table}: RLS is not forced`);
    if (t.scoped && t.policies === 0) {
      failures.push(`${t.table}: company-scoped but has no policy`);
    }
  }
  if (tables.length === 0)
    failures.push('no tables found: was the database migrated?');
  return failures;
}

async function auditRole(owner: PrismaClient, role: string): Promise<string[]> {
  const [attrs] = await owner.$queryRaw<
    {
      super: boolean;
      bypass: boolean;
      createrole: boolean;
      createdb: boolean;
    }[]
  >`SELECT rolsuper AS super, rolbypassrls AS bypass, rolcreaterole AS createrole,
           rolcreatedb AS createdb FROM pg_roles WHERE rolname = ${role}`;
  if (!attrs) return [`role ${role} does not exist`];
  const failures: string[] = [];
  if (attrs.super) failures.push(`${role} is a superuser`);
  if (attrs.bypass) failures.push(`${role} has BYPASSRLS`);
  if (attrs.createrole) failures.push(`${role} can create roles`);
  if (attrs.createdb) failures.push(`${role} can create databases`);
  const owned = await owner.$queryRaw<{ name: string }[]>`
    SELECT tablename AS name FROM pg_tables
    WHERE schemaname = 'public' AND tableowner = ${role}`;
  for (const t of owned) failures.push(`${role} owns table ${t.name}`);
  const parents = await owner.$queryRaw<{ name: string }[]>`
    SELECT r.rolname AS name FROM pg_auth_members m
    JOIN pg_roles r ON r.oid = m.roleid
    JOIN pg_roles member ON member.oid = m.member
    WHERE member.rolname = ${role}`;
  for (const p of parents) failures.push(`${role} is a member of ${p.name}`);
  return failures;
}

async function auditAppendOnly(
  owner: PrismaClient,
  role: string,
): Promise<string[]> {
  const failures: string[] = [];
  for (const table of APPEND_ONLY) {
    const [grants] = await owner.$queryRaw<{ ok: boolean; found: boolean }[]>`
      SELECT NOT (has_table_privilege(${role}, ${table}, 'UPDATE')
                  OR has_table_privilege(${role}, ${table}, 'DELETE')
                  OR has_table_privilege(${role}, ${table}, 'TRUNCATE')) AS ok,
             true AS found
      FROM pg_class WHERE relname = ${table} AND relnamespace = 'public'::regnamespace`;
    if (!grants?.found) {
      failures.push(`${table}: append-only table does not exist`);
      continue;
    }
    if (!grants.ok)
      failures.push(`${table}: ${role} can update, delete or truncate`);
    const writers = await owner.$queryRaw<{ name: string }[]>`
      SELECT p.polname AS name FROM pg_policy p
      WHERE p.polrelid = ('public.' || ${table})::regclass AND p.polcmd IN ('w', 'd', '*')`;
    for (const p of writers) {
      failures.push(`${table}: policy ${p.name} allows update or delete`);
    }
  }
  return failures;
}

async function tableNames(owner: PrismaClient): Promise<string[]> {
  const rows = await owner.$queryRaw<{ name: string }[]>`
    SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public'`;
  return rows.map((r) => r.name).filter((n) => !NOT_AUDITED.includes(n));
}

async function auditLiveAccess(
  owner: PrismaClient,
  api: PrismaClient,
  tables: string[],
): Promise<string[]> {
  const failures: string[] = [];
  const [{ user }] = await api.$queryRaw<
    { user: string }[]
  >`SELECT current_user AS user`;
  failures.push(...(await auditRole(owner, user)));
  failures.push(...(await auditAppendOnly(owner, user)));
  for (const table of tables) {
    // Table names come from pg_tables, not user input; identifiers cannot be bound.
    const sql = `SELECT count(*)::int AS n FROM "${table}"`;
    const [{ n: all }] = await owner.$queryRawUnsafe<{ n: number }[]>(sql);
    if (all === 0) {
      failures.push(
        `${table}: no seeded rows, so the live check proves nothing (load the seed)`,
      );
      continue;
    }
    // Without an identity the API role must see nothing; a table it has no grant on is also fine.
    const visible = await api.$queryRawUnsafe<{ n: number }[]>(sql).then(
      (rows) => rows[0].n,
      (error: unknown) => {
        if (String(error).includes('permission denied')) return 0;
        throw error;
      },
    );
    if (visible !== 0)
      failures.push(
        `${table}: API role sees ${visible} rows without an identity`,
      );
  }
  return failures;
}

async function main() {
  const owner = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
  const api = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  try {
    const tables = await tableNames(owner);
    const failures = [
      ...(await auditTables(owner)),
      ...(await auditLiveAccess(owner, api, tables)),
    ];
    if (failures.length > 0) {
      console.error(
        `RLS audit FAILED:\n${failures.map((f) => `  - ${f}`).join('\n')}`,
      );
      process.exit(1);
    }
    console.log(
      `RLS audit passed for ${tables.length} tables: ${tables.join(', ')}`,
    );
  } finally {
    await owner.$disconnect();
    await api.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
