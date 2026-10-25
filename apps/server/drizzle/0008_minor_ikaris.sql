CREATE TABLE "shift_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shift_sessions" ADD CONSTRAINT "shift_sessions_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_sessions" ADD CONSTRAINT "shift_sessions_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_sessions" ADD CONSTRAINT "shift_sessions_ended_by_id_users_id_fk" FOREIGN KEY ("ended_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shift_sessions_open_staff" ON "shift_sessions" USING btree ("staff_id") WHERE "shift_sessions"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "shift_sessions_staff_idx" ON "shift_sessions" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "shift_sessions_home_idx" ON "shift_sessions" USING btree ("home_id");