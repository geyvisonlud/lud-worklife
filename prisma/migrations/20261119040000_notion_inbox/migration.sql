-- AlterTable
ALTER TABLE "NotionConnection" ADD COLUMN     "inboxDatabaseId" TEXT,
ADD COLUMN     "inboxError" TEXT,
ADD COLUMN     "inboxSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "notionInboxPageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Task_notionInboxPageId_key" ON "Task"("notionInboxPageId");

