-- G-128 M3 (D385): when the reconciliation last ran, for the launch check.
-- CreateTable
CREATE TABLE "BillingRun" (
    "kind" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "ok" BOOLEAN NOT NULL,

    CONSTRAINT "BillingRun_pkey" PRIMARY KEY ("kind")
);