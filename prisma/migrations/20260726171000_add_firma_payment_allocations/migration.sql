CREATE TABLE "FirmaPaymentAllocation" (
  "id" TEXT NOT NULL,
  "firmaId" TEXT NOT NULL,
  "paymentIslemId" TEXT NOT NULL,
  "debtIslemId" TEXT NOT NULL,
  "tutar" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FirmaPaymentAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FirmaPaymentAllocation_paymentIslemId_debtIslemId_key"
  ON "FirmaPaymentAllocation"("paymentIslemId", "debtIslemId");
CREATE INDEX "FirmaPaymentAllocation_firmaId_idx"
  ON "FirmaPaymentAllocation"("firmaId");
CREATE INDEX "FirmaPaymentAllocation_debtIslemId_idx"
  ON "FirmaPaymentAllocation"("debtIslemId");

ALTER TABLE "FirmaPaymentAllocation"
  ADD CONSTRAINT "FirmaPaymentAllocation_firmaId_fkey"
  FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FirmaPaymentAllocation"
  ADD CONSTRAINT "FirmaPaymentAllocation_paymentIslemId_fkey"
  FOREIGN KEY ("paymentIslemId") REFERENCES "FirmaIslem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FirmaPaymentAllocation"
  ADD CONSTRAINT "FirmaPaymentAllocation_debtIslemId_fkey"
  FOREIGN KEY ("debtIslemId") REFERENCES "FirmaIslem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

WITH debt_rows AS (
  SELECT
    fi."id",
    fi."firmaId",
    fi."tutar",
    COALESCE(
      SUM(fi."tutar") OVER (
        PARTITION BY fi."firmaId"
        ORDER BY fi."tarih", fi."createdAt", fi."id"
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    ) AS range_start
  FROM "FirmaIslem" fi
  WHERE fi."status" = 'AKTIF'
    AND fi."islemTipi" IN ('ALIM', 'HIZMET')
),
payment_rows AS (
  SELECT
    fi."id",
    fi."firmaId",
    fi."tutar",
    COALESCE(
      SUM(fi."tutar") OVER (
        PARTITION BY fi."firmaId"
        ORDER BY fi."tarih", fi."createdAt", fi."id"
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    ) AS range_start
  FROM "FirmaIslem" fi
  WHERE fi."status" = 'AKTIF'
    AND fi."islemTipi" = 'ODEME'
),
allocations AS (
  SELECT
    d."firmaId",
    p."id" AS "paymentIslemId",
    d."id" AS "debtIslemId",
    GREATEST(
      0,
      LEAST(d.range_start + d."tutar", p.range_start + p."tutar")
        - GREATEST(d.range_start, p.range_start)
    ) AS "tutar"
  FROM debt_rows d
  INNER JOIN payment_rows p ON p."firmaId" = d."firmaId"
)
INSERT INTO "FirmaPaymentAllocation" (
  "id",
  "firmaId",
  "paymentIslemId",
  "debtIslemId",
  "tutar"
)
SELECT
  'fpa_' || md5(
    allocations."firmaId"
      || ':' || allocations."paymentIslemId"
      || ':' || allocations."debtIslemId"
  ),
  allocations."firmaId",
  allocations."paymentIslemId",
  allocations."debtIslemId",
  allocations."tutar"
FROM allocations
WHERE allocations."tutar" > 0;
