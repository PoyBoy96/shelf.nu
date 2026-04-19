-- CreateEnum
CREATE TYPE "UserTheme" AS ENUM ('original', 'dark', 'light');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "theme" "UserTheme" NOT NULL DEFAULT 'original';
