-- CreateTable
CREATE TABLE "PlatformTheme" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "activeTheme" TEXT NOT NULL DEFAULT 'klasik',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformTheme_pkey" PRIMARY KEY ("id")
);
