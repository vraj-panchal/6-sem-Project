CREATE TABLE "product_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"batch_no" varchar(100) NOT NULL,
	"mrp" numeric(12, 2) NOT NULL,
	"base_price" numeric(12, 2) NOT NULL,
	"current_stock" numeric(12, 2) DEFAULT '0',
	"expiry_date" date,
	"created_at" timestamp DEFAULT now(),
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "product_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"transaction_type" "transaction_type_enum" NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"previous_stock" numeric(12, 2),
	"new_stock" numeric(12, 2),
	"performed_by" bigint,
	"remarks" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_transactions" ADD CONSTRAINT "product_transactions_batch_id_product_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."product_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_transactions" ADD CONSTRAINT "product_transactions_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_product_batch" ON "product_batches" USING btree ("product_id","batch_no");