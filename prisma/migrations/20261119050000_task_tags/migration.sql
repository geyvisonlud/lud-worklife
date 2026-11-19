-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

