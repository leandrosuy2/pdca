ALTER TABLE "User"
ADD COLUMN "launchUnitId" TEXT;

CREATE UNIQUE INDEX "User_launchUnitId_key" ON "User"("launchUnitId");

ALTER TABLE "User"
ADD CONSTRAINT "User_launchUnitId_fkey"
FOREIGN KEY ("launchUnitId") REFERENCES "Unidade"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
