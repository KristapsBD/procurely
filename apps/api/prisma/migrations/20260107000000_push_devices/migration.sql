-- Push notification devices: the Expo push token of a phone, bound to the person and to the one
-- company they act in on it. A token is a device, so it is unique: signing in as someone else,
-- or switching company, moves the device. A notification about a company goes only to devices
-- registered for that company, so a person acting in company B never receives company A's.
--
--   table         select / delete                           insert / update
--   push_devices  the person's own rows in the current      none directly: register_push_device()
--                 company (an active member)
--
-- Finding who to notify needs other people's devices, which no policy shows. Two narrow SECURITY
-- DEFINER functions do it, each only for the person whose action triggers the notification.

-- CreateTable
CREATE TABLE "push_devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_token_key" ON "push_devices"("token");

-- CreateIndex
CREATE INDEX "push_devices_company_id_person_id_idx" ON "push_devices"("company_id", "person_id");

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE push_devices ADD CONSTRAINT push_devices_token_check CHECK (btrim(token) <> '');

ALTER TABLE push_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_devices FORCE ROW LEVEL SECURITY;

GRANT SELECT, DELETE ON push_devices TO procurely_api;

CREATE POLICY push_devices_own_select ON push_devices FOR SELECT
  USING (
    company_id = current_company_id()
    AND person_id = current_person_id()
    AND active_role_in(company_id) IS NOT NULL
  );

CREATE POLICY push_devices_own_delete ON push_devices FOR DELETE
  USING (
    company_id = current_company_id()
    AND person_id = current_person_id()
  );

-- Binds a device to the current person in the current company. Taking over a token that another
-- person (or company) held is the point: the device is whoever is signed in on it now. A plain
-- INSERT could not do that, because the previous owner's row is invisible to the new one.
-- Like invite_person, this assumes the migration owner is not itself bound by row-level security.
CREATE FUNCTION register_push_device(p_token text) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
BEGIN
  IF current_company_id() IS NULL OR active_role_in(current_company_id()) IS NULL THEN
    RAISE EXCEPTION 'row-level security: only an active member may register a device'
      USING ERRCODE = '42501';
  END IF;
  INSERT INTO push_devices (company_id, person_id, token)
    VALUES (current_company_id(), current_person_id(), btrim(p_token))
    ON CONFLICT (token) DO UPDATE
      SET company_id = EXCLUDED.company_id,
          person_id = EXCLUDED.person_id,
          updated_at = CURRENT_TIMESTAMP;
END
$$;

REVOKE ALL ON FUNCTION register_push_device(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_push_device(text) TO procurely_api;

-- Tokens of the devices to tell that a requisition awaits a decision: people who may decide it
-- (an admin, and an approver when the route is APPROVER), still active members, with a device
-- registered for this company. Answers only to the requester of a submitted requisition of the
-- current company, and never includes the requester.
CREATE FUNCTION push_tokens_for_approval(p_requisition uuid) RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT d.token
    FROM requisitions r
    JOIN memberships m ON m.company_id = r.company_id AND m.active
    JOIN push_devices d ON d.company_id = r.company_id AND d.person_id = m.person_id
    WHERE r.id = p_requisition
      AND r.company_id = current_company_id()
      AND r.requester_person_id = current_person_id()
      AND active_role_in(r.company_id) IS NOT NULL
      AND r.status = 'SUBMITTED'
      AND m.person_id <> r.requester_person_id
      AND (m.role = 'ADMIN' OR (m.role = 'APPROVER' AND r.approval_route = 'APPROVER'))
  $$;

REVOKE ALL ON FUNCTION push_tokens_for_approval(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION push_tokens_for_approval(uuid) TO procurely_api;

-- Tokens of the requester's devices registered for this company, for a decided requisition.
-- Answers only to the person who made the decision.
CREATE FUNCTION push_tokens_for_decision(p_requisition uuid) RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT d.token
    FROM requisitions r
    JOIN requisition_decisions dec ON dec.requisition_id = r.id
      AND dec.actor_person_id = current_person_id()
    JOIN memberships m ON m.company_id = r.company_id
      AND m.person_id = r.requester_person_id AND m.active
    JOIN push_devices d ON d.company_id = r.company_id AND d.person_id = r.requester_person_id
    WHERE r.id = p_requisition
      AND r.company_id = current_company_id()
      AND r.status IN ('APPROVED', 'REJECTED')
  $$;

REVOKE ALL ON FUNCTION push_tokens_for_decision(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION push_tokens_for_decision(uuid) TO procurely_api;
