CREATE TABLE "day_entry_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_entry_id" uuid NOT NULL,
	"uploaded_by_id" uuid,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "day_entry_photos" ADD CONSTRAINT "day_entry_photos_day_entry_id_day_entries_id_fk" FOREIGN KEY ("day_entry_id") REFERENCES "public"."day_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_entry_photos" ADD CONSTRAINT "day_entry_photos_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "day_entry_photos_day_entry_idx" ON "day_entry_photos" USING btree ("day_entry_id");