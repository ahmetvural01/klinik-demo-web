UPDATE "LabOrder" AS orders
SET
  "price" = invoice_totals."total",
  "updatedAt" = CURRENT_TIMESTAMP
FROM (
  SELECT "labOrderId", SUM("amount") AS "total"
  FROM "LabOrderInvoice"
  GROUP BY "labOrderId"
) AS invoice_totals
WHERE orders."id" = invoice_totals."labOrderId"
  AND orders."price" IS DISTINCT FROM invoice_totals."total";
