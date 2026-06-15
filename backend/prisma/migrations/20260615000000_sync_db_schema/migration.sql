-- CreateEnum
CREATE TYPE "MembershipSource" AS ENUM ('MANUAL', 'IMPORT_RESOLUTION');

-- AlterTable (Add slug as nullable first to support existing production data)
ALTER TABLE "groups" ADD COLUMN     "slug" VARCHAR(255);

-- Populate slug for existing groups
UPDATE "groups" SET "slug" = "id" WHERE "slug" IS NULL;

-- AlterTable (Set slug as NOT NULL)
ALTER TABLE "groups" ALTER COLUMN "slug" SET NOT NULL;

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "source" "MembershipSource" NOT NULL DEFAULT 'MANUAL';

-- CreateIndex
CREATE UNIQUE INDEX "groups_slug_key" ON "groups"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_created_expense_id_key" ON "import_rows"("created_expense_id");
