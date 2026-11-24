CREATE TYPE "public"."check_schedule_kind" AS ENUM('DAILY', 'WEEKLY');--> statement-breakpoint
CREATE TABLE "check_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"submitted_by_id" uuid,
	"submitted_by_name" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"template_name" text NOT NULL,
	"template_version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"answers" jsonb NOT NULL,
	"issue_count" integer NOT NULL,
	"late" boolean NOT NULL,
	"storage_key" text,
	"pdf" "bytea",
	CONSTRAINT "check_submissions_occurrence" UNIQUE("template_id","home_id","due_date"),
	CONSTRAINT "check_submissions_one_location" CHECK (("check_submissions"."pdf" IS NULL) <> ("check_submissions"."storage_key" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "check_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"schedule_kind" "check_schedule_kind" NOT NULL,
	"schedule_days" "weekday"[] DEFAULT '{}'::weekday[] NOT NULL,
	"due_by_time" text,
	"definition" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "check_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "check_submissions" ADD CONSTRAINT "check_submissions_template_id_check_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."check_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_submissions" ADD CONSTRAINT "check_submissions_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_submissions" ADD CONSTRAINT "check_submissions_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_submissions_home_date_idx" ON "check_submissions" USING btree ("home_id","due_date");