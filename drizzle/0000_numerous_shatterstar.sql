CREATE TABLE "price_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"tracked_url_id" integer NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"product_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"product_slug" text NOT NULL,
	"normal_price" integer NOT NULL,
	"offer_price" integer NOT NULL,
	"store_name" text,
	"store_url" text
);
--> statement-breakpoint
CREATE TABLE "tracked_urls" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"label" text NOT NULL,
	"category_id" integer,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_checks" ADD CONSTRAINT "price_checks_tracked_url_id_tracked_urls_id_fk" FOREIGN KEY ("tracked_url_id") REFERENCES "public"."tracked_urls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_checks_tracked_url_checked_at_idx" ON "price_checks" USING btree ("tracked_url_id","checked_at");