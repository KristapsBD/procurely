-- Roles inside a company, membership management and the append-only audit log.
--
-- Role matrix (an "active member" holds an active membership in the current company):
--   table        select                                   insert / update / delete
--   companies    active member of that company            -
--   people       self; an admin sees the people who       insert only through invite_person()
--                have a membership in the current company
--   memberships  own active rows (list my companies);     admin of the current company: insert,
--                an admin sees all of the company's rows  update role/active; never delete
--   cost_centers any active member                        admin only
--   audit_log    admin only                               insert by any active member (as
--                                                         themselves); never update or delete

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "actor_person_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_company_id_created_at_idx" ON "audit_log"("company_id", "created_at");

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

-- Role helper. SECURITY DEFINER so a policy on memberships can ask about memberships
-- without recursing into its own policies (the function owner reads the table directly, as
-- the seed does). It only reveals the current person's own role in the given company.
-- NULL means "no active membership".
CREATE FUNCTION active_role_in(p_company uuid) RETURNS "Role"
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT role FROM memberships
        WHERE company_id = p_company AND person_id = current_person_id() AND active $$;

REVOKE ALL ON FUNCTION active_role_in(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION active_role_in(uuid) TO procurely_api;

-- Find or create a person by email so an admin can invite someone who has no account yet
-- (Google sign-in later matches the person by email). Reading people by email would let an
-- admin enumerate other companies' people, so only this narrow function may do it, and only
-- for an admin of the current company. It returns the person id and nothing else.
CREATE FUNCTION invite_person(p_email text, p_name text) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  v_id uuid;
BEGIN
  IF current_company_id() IS NULL OR active_role_in(current_company_id()) IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'row-level security: only an admin of the current company may invite people'
      USING ERRCODE = '42501';
  END IF;
  INSERT INTO people (email, name) VALUES (lower(p_email), p_name) ON CONFLICT (email) DO NOTHING;
  SELECT id INTO v_id FROM people WHERE email = lower(p_email);
  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION invite_person(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION invite_person(text, text) TO procurely_api;

-- people: an admin also sees the people who have a membership in the current company.
CREATE POLICY people_company_admin ON people FOR SELECT
  USING (
    active_role_in(current_company_id()) = 'ADMIN'
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.person_id = people.id AND m.company_id = current_company_id()
    )
  );

-- memberships: admins of the current company read every membership of it (including
-- deactivated ones), invite (insert) and change role or active. Nobody deletes: deactivate.
-- Only role and active are updatable, so a membership cannot be moved to another person or company.
GRANT INSERT ON memberships TO procurely_api;
GRANT UPDATE (role, active) ON memberships TO procurely_api;

CREATE POLICY memberships_company_admin_select ON memberships FOR SELECT
  USING (
    company_id = current_company_id()
    AND active_role_in(company_id) = 'ADMIN'
  );

CREATE POLICY memberships_company_admin_insert ON memberships FOR INSERT
  WITH CHECK (
    company_id = current_company_id()
    AND active_role_in(company_id) = 'ADMIN'
  );

CREATE POLICY memberships_company_admin_update ON memberships FOR UPDATE
  USING (
    company_id = current_company_id()
    AND active_role_in(company_id) = 'ADMIN'
  )
  WITH CHECK (
    company_id = current_company_id()
    AND active_role_in(company_id) = 'ADMIN'
  );

-- cost_centers: every active member reads, only admins write.
DROP POLICY cost_centers_company_isolation ON cost_centers;

CREATE POLICY cost_centers_member_select ON cost_centers FOR SELECT
  USING (
    company_id = current_company_id()
    AND active_role_in(company_id) IS NOT NULL
  );

CREATE POLICY cost_centers_admin_write ON cost_centers FOR ALL
  USING (
    company_id = current_company_id()
    AND active_role_in(company_id) = 'ADMIN'
  )
  WITH CHECK (
    company_id = current_company_id()
    AND active_role_in(company_id) = 'ADMIN'
  );

-- audit_log: append-only. No UPDATE or DELETE grant and no UPDATE or DELETE policy, so both
-- are refused twice over. Any active member may append an entry as themselves (every
-- workflow writes one); only admins of the company read them.
GRANT SELECT, INSERT ON audit_log TO procurely_api;

CREATE POLICY audit_log_admin_select ON audit_log FOR SELECT
  USING (
    company_id = current_company_id()
    AND active_role_in(company_id) = 'ADMIN'
  );

CREATE POLICY audit_log_member_insert ON audit_log FOR INSERT
  WITH CHECK (
    company_id = current_company_id()
    AND actor_person_id = current_person_id()
    AND active_role_in(company_id) IS NOT NULL
  );
