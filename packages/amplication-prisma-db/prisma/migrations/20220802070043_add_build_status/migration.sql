CREATE TYPE "BuildStatus" AS ENUM ('Init', 'InProgress', 'Succeeded', 'Unpacking', 'Failed', 'Stopped', 'Ready');

ALTER TABLE "Build" ADD COLUMN "status" "BuildStatus";

UPDATE "Build" SET "status" = (
    CASE
        WHEN (SELECT COUNT(*) FROM "ActionStep" WHERE "actionId" = "Build"."actionId" AND "status" != 'Success') = 0 THEN 'Succeeded'::"BuildStatus"
        WHEN (SELECT COUNT(*) FROM "ActionStep" WHERE "actionId" = "Build"."actionId" AND "status" = 'Failed') > 0 THEN 'Failed'::"BuildStatus"
        ELSE 'InProgress'::"BuildStatus"
    END
);

ALTER TABLE "Build" ALTER COLUMN "status" SET NOT NULL;

ALTER TABLE "Build" ADD COLUMN "runId" TEXT;
