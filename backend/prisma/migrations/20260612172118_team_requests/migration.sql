-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('CREAR_PENDIENTE', 'EXTENSION', 'REASIGNACION', 'CAMBIO_ESTADO');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

-- CreateTable
CREATE TABLE "TeamRequest" (
    "id" SERIAL NOT NULL,
    "type" "RequestType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDIENTE',
    "requesterId" INTEGER NOT NULL,
    "taskId" INTEGER,
    "payload" JSONB NOT NULL,
    "rejectionReason" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamRequest_status_idx" ON "TeamRequest"("status");

-- AddForeignKey
ALTER TABLE "TeamRequest" ADD CONSTRAINT "TeamRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamRequest" ADD CONSTRAINT "TeamRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
