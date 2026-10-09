-- The outcomes of an approval. A migration of its own: Postgres does not let the transaction that
-- adds an enum value also use it, and the next migration's checks and policies use both.
ALTER TYPE "RequisitionStatus" ADD VALUE 'APPROVED' BEFORE 'CANCELLED';
ALTER TYPE "RequisitionStatus" ADD VALUE 'REJECTED' BEFORE 'CANCELLED';
