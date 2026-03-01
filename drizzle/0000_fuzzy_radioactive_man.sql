CREATE TABLE "alerts_sent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_item_id" uuid NOT NULL,
	"days_before_expiry" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" varchar(64) NOT NULL,
	"product_name" varchar(255) NOT NULL,
	"expiry_date" date NOT NULL,
	"image_url" text,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"confidence" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"chat_id" varchar(64) PRIMARY KEY NOT NULL,
	"locale" varchar(5) DEFAULT 'en' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts_sent" ADD CONSTRAINT "alerts_sent_food_item_id_food_items_id_fk" FOREIGN KEY ("food_item_id") REFERENCES "public"."food_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_sent_food_item_id_days_before_expiry_uidx" ON "alerts_sent" USING btree ("food_item_id","days_before_expiry");--> statement-breakpoint
CREATE INDEX "alerts_sent_food_item_id_idx" ON "alerts_sent" USING btree ("food_item_id");--> statement-breakpoint
CREATE INDEX "food_items_chat_id_idx" ON "food_items" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "food_items_expiry_date_active_idx" ON "food_items" USING btree ("expiry_date") WHERE "food_items"."status" = 'active';