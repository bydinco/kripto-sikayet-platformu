-- AlterEnum
ALTER TYPE "ModerationAction" ADD VALUE 'HIDE_COMMENT';

-- AlterTable
ALTER TABLE "ModerationLog" ADD COLUMN     "commentId" TEXT;

-- AlterTable
ALTER TABLE "ReportComment" ADD COLUMN     "meTooReportId" TEXT,
ADD COLUMN     "removedAt" TIMESTAMP(3),
ADD COLUMN     "removedById" TEXT,
ADD COLUMN     "removedReason" TEXT;

-- CreateIndex
CREATE INDEX "ModerationLog_commentId_idx" ON "ModerationLog"("commentId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportComment_meTooReportId_userId_key" ON "ReportComment"("meTooReportId", "userId");

-- AddForeignKey
ALTER TABLE "ReportComment" ADD CONSTRAINT "ReportComment_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationLog" ADD CONSTRAINT "ModerationLog_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ReportComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

