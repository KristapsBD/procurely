-- created_at is the transaction start time, so every entry one request writes
-- shares it. seq records insertion order so those entries read back in the
-- order they happened.
ALTER TABLE "audit_log" ADD COLUMN "seq" BIGSERIAL NOT NULL;

CREATE UNIQUE INDEX "audit_log_seq_key" ON "audit_log"("seq");

GRANT USAGE ON SEQUENCE audit_log_seq_seq TO procurely_api;
