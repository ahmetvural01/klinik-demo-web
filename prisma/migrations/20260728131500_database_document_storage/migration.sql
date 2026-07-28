CREATE TABLE "DocumentBlob" (
  "storedName" TEXT NOT NULL,
  "encryptedData" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentBlob_pkey" PRIMARY KEY ("storedName")
);
