-- AlterTable
ALTER TABLE "CalendarAccount" ADD COLUMN     "tasksError" TEXT,
ADD COLUMN     "tasksSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "googleTaskId" TEXT,
ADD COLUMN     "googleTaskListId" TEXT,
ADD COLUMN     "googleTaskUpdated" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "GoogleTaskList" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "GoogleTaskList_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleTaskList_accountId_externalId_key" ON "GoogleTaskList"("accountId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_googleTaskListId_googleTaskId_key" ON "Task"("googleTaskListId", "googleTaskId");

-- AddForeignKey
ALTER TABLE "GoogleTaskList" ADD CONSTRAINT "GoogleTaskList_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CalendarAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_googleTaskListId_fkey" FOREIGN KEY ("googleTaskListId") REFERENCES "GoogleTaskList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

