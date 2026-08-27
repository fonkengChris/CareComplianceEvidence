CREATE TABLE "template_day_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"day" "weekday" NOT NULL,
	"line_number" integer NOT NULL,
	"activity_type_id" uuid,
	"description" text,
	"time_allocated" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_day_entries_template_day_line" UNIQUE("template_id","day","line_number")
);
--> statement-breakpoint
CREATE TABLE "week_plan_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_user_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "week_plan_templates_service_user" UNIQUE("service_user_id")
);
--> statement-breakpoint
ALTER TABLE "template_day_entries" ADD CONSTRAINT "template_day_entries_template_id_week_plan_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."week_plan_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_day_entries" ADD CONSTRAINT "template_day_entries_activity_type_id_activity_types_id_fk" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_plan_templates" ADD CONSTRAINT "week_plan_templates_service_user_id_service_users_id_fk" FOREIGN KEY ("service_user_id") REFERENCES "public"."service_users"("id") ON DELETE cascade ON UPDATE no action;