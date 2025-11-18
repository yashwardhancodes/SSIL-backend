/*
  Warnings:

  - You are about to drop the column `taxTotal` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `tax` on the `InvoiceItem` table. All the data in the column will be lost.
  - Made the column `discount` on table `Invoice` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "InvoiceItem" DROP CONSTRAINT "InvoiceItem_itemId_fkey";

-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "taxTotal",
ADD COLUMN     "amountInWords" TEXT,
ADD COLUMN     "cgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "cgstRate" DOUBLE PRECISION NOT NULL DEFAULT 9,
ADD COLUMN     "igstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "igstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "particular" TEXT,
ADD COLUMN     "roundOff" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sgstRate" DOUBLE PRECISION NOT NULL DEFAULT 9,
ADD COLUMN     "siteName" TEXT,
ALTER COLUMN "discount" SET NOT NULL,
ALTER COLUMN "balance" DROP DEFAULT;

-- AlterTable
ALTER TABLE "InvoiceItem" DROP COLUMN "tax",
ADD COLUMN     "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "hsnSac" TEXT,
ADD COLUMN     "particular" TEXT,
ADD COLUMN     "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 18,
ADD COLUMN     "unit" TEXT,
ALTER COLUMN "quantity" SET DEFAULT 1,
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "rate" SET DEFAULT 0,
ALTER COLUMN "total" SET DEFAULT 0,
ALTER COLUMN "itemId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "hsnSac" TEXT,
ALTER COLUMN "purchaseRate" SET DEFAULT 0,
ALTER COLUMN "saleRate" SET DEFAULT 0,
ALTER COLUMN "taxRate" SET DEFAULT 18,
ALTER COLUMN "currentStock" SET DEFAULT 0,
ALTER COLUMN "currentStock" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "lowStockAlert" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Party" ADD COLUMN     "state" TEXT,
ADD COLUMN     "stateCode" TEXT,
ALTER COLUMN "currentBalance" SET DEFAULT 0,
ALTER COLUMN "openingBalance" SET DEFAULT 0;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
