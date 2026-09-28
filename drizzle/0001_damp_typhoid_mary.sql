CREATE TABLE "url_check_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"price_check_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"normal_price" integer NOT NULL,
	"offer_price" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "url_check_products_check_position_unique" UNIQUE("price_check_id","position")
);
--> statement-breakpoint
ALTER TABLE "url_check_products" ADD CONSTRAINT "url_check_products_price_check_id_price_checks_id_fk" FOREIGN KEY ("price_check_id") REFERENCES "public"."price_checks"("id") ON DELETE cascade ON UPDATE no action;