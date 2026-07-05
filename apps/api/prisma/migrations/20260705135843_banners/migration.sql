-- CreateTable
CREATE TABLE "banners" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kicker" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "coupon_code" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);
