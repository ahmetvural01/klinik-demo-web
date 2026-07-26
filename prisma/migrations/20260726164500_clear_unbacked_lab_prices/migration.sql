UPDATE "LabOrder" AS orders
SET
  "price" = 0,
  "invoiceNo" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "LabOrderInvoice" AS invoices
  WHERE invoices."labOrderId" = orders."id"
)
AND (
  orders."price" IS DISTINCT FROM 0
  OR orders."invoiceNo" IS NOT NULL
);
