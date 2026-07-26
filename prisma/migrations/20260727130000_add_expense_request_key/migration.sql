-- Expense (gider) creation had no idempotency key, unlike Payment/Purchase/
-- FirmaIslem — a network retry or double-click could create a duplicate
-- financial record with no way to detect it server-side.
ALTER TABLE "Expense" ADD COLUMN "requestKey" TEXT;
CREATE UNIQUE INDEX "Expense_requestKey_key" ON "Expense"("requestKey");
