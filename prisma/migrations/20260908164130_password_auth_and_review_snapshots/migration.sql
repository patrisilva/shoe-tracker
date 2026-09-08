-- AlterTable
ALTER TABLE "ShoeLink" ADD COLUMN     "excerpt" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordHash" TEXT;
