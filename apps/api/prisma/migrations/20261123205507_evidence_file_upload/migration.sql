-- AlterEnum
ALTER TYPE "ModerationAction" ADD VALUE 'VIEW_EVIDENCE';

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "sha256" TEXT,
ADD COLUMN     "sizeBytes" INTEGER,
ADD COLUMN     "storageKey" TEXT;
