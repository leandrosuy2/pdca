CREATE TABLE "InputColumnValidation" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "sectionKey" TEXT NOT NULL,
  "weekIndex" INTEGER NOT NULL,
  "validatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InputColumnValidation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InputColumnValidation_unitId_month_sectionKey_weekIndex_key"
ON "InputColumnValidation"("unitId", "month", "sectionKey", "weekIndex");

CREATE INDEX "InputColumnValidation_unitId_month_idx"
ON "InputColumnValidation"("unitId", "month");

ALTER TABLE "InputColumnValidation"
ADD CONSTRAINT "InputColumnValidation_unitId_fkey"
FOREIGN KEY ("unitId") REFERENCES "Unidade"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InputColumnValidation"
ADD CONSTRAINT "InputColumnValidation_validatedById_fkey"
FOREIGN KEY ("validatedById") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
