-- Row-level security: the API connects as procurely_api, which cannot bypass RLS.
-- Every request runs in a transaction that first sets the transaction-local
-- settings app.current_user_id and app.current_company_id; the policies below
-- verify them against active memberships.

-- 1. Restricted API role (idempotent: roles are cluster-wide and survive a schema reset).
-- The password is a local-development default; provision the role out of band elsewhere.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'procurely_api') THEN
    CREATE ROLE procurely_api LOGIN PASSWORD 'procurely_api'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO procurely_api;

-- 2. Session helpers. NULLIF turns "unset" and "" into NULL, so no identity matches nothing.
CREATE FUNCTION current_person_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid $$;

CREATE FUNCTION current_company_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.current_company_id', true), '')::uuid $$;

GRANT EXECUTE ON FUNCTION current_person_id(), current_company_id() TO procurely_api;

-- 3. Enable and force RLS everywhere, so even the table owner is subject to policies.
ALTER TABLE companies   ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies   FORCE ROW LEVEL SECURITY;
ALTER TABLE people      ENABLE ROW LEVEL SECURITY;
ALTER TABLE people      FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_centers FORCE ROW LEVEL SECURITY;

-- 4. Identity tables: read-only for the API, and only what concerns the current person.
GRANT SELECT ON people, memberships, companies TO procurely_api;

CREATE POLICY people_self ON people FOR SELECT
  USING (id = current_person_id());

CREATE POLICY memberships_own_active ON memberships FOR SELECT
  USING (person_id = current_person_id() AND active);

CREATE POLICY companies_member ON companies FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.company_id = companies.id
      AND m.person_id = current_person_id()
      AND m.active
  ));

-- 5. Company isolation for cost centers: the row's company must be the current company
-- and the current person must hold an active membership in it.
GRANT SELECT, INSERT, UPDATE, DELETE ON cost_centers TO procurely_api;

CREATE POLICY cost_centers_company_isolation ON cost_centers FOR ALL
  USING (
    company_id = current_company_id()
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.company_id = cost_centers.company_id
        AND m.person_id = current_person_id()
        AND m.active
    )
  )
  WITH CHECK (
    company_id = current_company_id()
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.company_id = cost_centers.company_id
        AND m.person_id = current_person_id()
        AND m.active
    )
  );
