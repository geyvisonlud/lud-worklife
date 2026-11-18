-- AlterTable
ALTER TABLE "NoteFolder" ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "NoteFolder_parentId_idx" ON "NoteFolder"("parentId");

-- AddForeignKey
ALTER TABLE "NoteFolder" ADD CONSTRAINT "NoteFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NoteFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

