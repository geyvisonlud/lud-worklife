-- AlterTable
ALTER TABLE "ReadItem" ADD COLUMN     "byline" TEXT,
ADD COLUMN     "content" TEXT,
ADD COLUMN     "contentAt" TIMESTAMP(3),
ADD COLUMN     "readMinutes" INTEGER;

