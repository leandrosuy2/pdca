CREATE TABLE "Gestora" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gestora_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Unidade"
ADD COLUMN "gestoraId" TEXT;

CREATE UNIQUE INDEX "Gestora_userId_name_key" ON "Gestora"("userId", "name");

CREATE UNIQUE INDEX "Unidade_userId_name_key" ON "Unidade"("userId", "name");

ALTER TABLE "Gestora"
ADD CONSTRAINT "Gestora_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Unidade"
ADD CONSTRAINT "Unidade_gestoraId_fkey"
FOREIGN KEY ("gestoraId") REFERENCES "Gestora"("id") ON DELETE SET NULL ON UPDATE CASCADE;
