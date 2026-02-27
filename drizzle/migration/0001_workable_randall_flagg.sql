CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"created_by" bigint,
	"product_name" varchar(255) NOT NULL,
	"brand" varchar(100),
	"sku" varchar(50) NOT NULL,
	"unit" varchar(10) NOT NULL,
	"base_weight" numeric(12, 2),
	"base_unit" varchar(10),
	"cgst" numeric(5, 2) DEFAULT '0',
	"sgst" numeric(5, 2) DEFAULT '0',
	"igst" numeric(5, 2) DEFAULT '0',
	"image_url" varchar(255),
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;