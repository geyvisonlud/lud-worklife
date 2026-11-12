-- CreateTable
CREATE TABLE "ReadItem" (
    "id" TEXT NOT NULL,
    "url" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "siteName" TEXT,
    "source" TEXT NOT NULL DEFAULT 'web',
    "via" TEXT NOT NULL DEFAULT 'app',
    "status" TEXT NOT NULL DEFAULT 'unread',
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "ReadItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReadItem_url_key" ON "ReadItem"("url");

-- CreateIndex
CREATE INDEX "ReadItem_status_savedAt_idx" ON "ReadItem"("status", "savedAt");

