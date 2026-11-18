-- AlterTable
ALTER TABLE "CalendarAccount" ADD COLUMN     "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastEmailScanAt" TIMESTAMP(3),
ADD COLUMN     "scopes" TEXT;

-- CreateTable
CREATE TABLE "EmailSuggestion" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "fromName" TEXT,
    "fromEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "snippet" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "title" TEXT,
    "reason" TEXT,
    "dueDate" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'rules',
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailSuggestion_status_receivedAt_idx" ON "EmailSuggestion"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSuggestion_accountId_messageId_key" ON "EmailSuggestion"("accountId", "messageId");

-- AddForeignKey
ALTER TABLE "EmailSuggestion" ADD CONSTRAINT "EmailSuggestion_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CalendarAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
