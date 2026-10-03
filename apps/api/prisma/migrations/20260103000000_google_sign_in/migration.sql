-- Google sign-in. A person is identified by Google's stable subject identifier (the `sub` claim
-- of the ID token), never by email alone: an email address can change hands, the subject cannot.

-- AlterTable
ALTER TABLE "people" ADD COLUMN "google_sub" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "people_google_sub_key" ON "people"("google_sub");

-- Find or create the person for a verified Google identity. Signing in happens before any
-- person is known, so under row-level security the API role sees no people at all; only this
-- narrow function may look people up for it, and it returns the person id and nothing else.
-- The API calls it only after verifying the ID token (signature, issuer, audience, expiry,
-- verified email).
--
--   1. A person already linked to this subject: that person (their email at Google may differ).
--   2. No person with this email: a new person linked to the subject, with no memberships.
--   3. A person with this email and no linked subject (invited by an admin, or seeded): linked
--      to the subject only when p_link_by_email is true, which the API passes only when Google
--      is authoritative for the address (a Gmail address, or a Google Workspace account).
--   4. Anything else (the email belongs to a person linked to another subject, or Google is not
--      authoritative for it): NULL, and the API refuses the sign-in.
--
-- Like invite_person, this assumes the migration owner is not itself bound by row-level security.
CREATE FUNCTION google_sign_in(p_sub text, p_email text, p_name text, p_link_by_email boolean)
  RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  v_id uuid;
  v_linked_sub text;
BEGIN
  SELECT id INTO v_id FROM people WHERE google_sub = p_sub;
  IF FOUND THEN
    RETURN v_id;
  END IF;
  SELECT id, google_sub INTO v_id, v_linked_sub FROM people WHERE email = lower(p_email);
  IF NOT FOUND THEN
    -- NULL when a concurrent sign-in took the email or the subject first; signing in again works.
    INSERT INTO people (email, name, google_sub) VALUES (lower(p_email), p_name, p_sub)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  IF v_linked_sub IS NULL AND p_link_by_email THEN
    UPDATE people SET google_sub = p_sub WHERE id = v_id;
    RETURN v_id;
  END IF;
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION google_sign_in(text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION google_sign_in(text, text, text, boolean) TO procurely_api;
