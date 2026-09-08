-- CreateTable
CREATE TABLE "ShoeImage" (
    "shoeId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoeImage_pkey" PRIMARY KEY ("shoeId")
);

-- AddForeignKey
ALTER TABLE "ShoeImage" ADD CONSTRAINT "ShoeImage_shoeId_fkey" FOREIGN KEY ("shoeId") REFERENCES "Shoe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
