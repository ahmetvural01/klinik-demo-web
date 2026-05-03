-- CreateTable
CREATE TABLE "MockSmsLog" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sender" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "responseData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MockSmsLog_pkey" PRIMARY KEY ("id")
);
