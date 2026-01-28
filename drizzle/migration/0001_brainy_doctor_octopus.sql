ALTER TABLE "products" ADD COLUMN "cgst_percent" numeric(5, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sgst_percent" numeric(5, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "igst_percent" numeric(5, 2) DEFAULT '0';