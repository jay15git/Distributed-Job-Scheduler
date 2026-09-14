/*
  Warnings:

  - You are about to drop the `ExecutionArtifact` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ExecutionArtifact" DROP CONSTRAINT "ExecutionArtifact_executionId_fkey";

-- DropTable
DROP TABLE "ExecutionArtifact";
