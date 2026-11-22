ALTER TABLE "day_entry_photos" ALTER COLUMN "data" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "day_entry_photos" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "day_entry_photos" ADD CONSTRAINT "day_entry_photos_one_location" CHECK (("day_entry_photos"."data" IS NULL) <> ("day_entry_photos"."storage_key" IS NULL));