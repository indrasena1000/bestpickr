-- CreateEnum
CREATE TYPE "NewsStatus" AS ENUM ('Draft', 'Pending', 'Approved', 'Rejected', 'Published', 'Archived');

-- CreateTable
CREATE TABLE "NewsArticle" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT,
    "imageUrl" TEXT,
    "source" TEXT NOT NULL,
    "sourceLink" TEXT NOT NULL,
    "publishDate" TIMESTAMP(3) NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "trendScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "relevance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "NewsStatus" NOT NULL DEFAULT 'Draft',
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "aiSummary" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_slug_key" ON "NewsArticle"("slug");

-- CreateIndex
CREATE INDEX "NewsArticle_publishDate_idx" ON "NewsArticle"("publishDate");

-- CreateIndex
CREATE INDEX "NewsArticle_status_idx" ON "NewsArticle"("status");

-- CreateIndex
CREATE INDEX "NewsArticle_visible_idx" ON "NewsArticle"("visible");
