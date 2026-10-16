CREATE TYPE "public"."access_request_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');--> statement-breakpoint
CREATE TABLE "auditor_access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditor_id" uuid NOT NULL,
	"service_user_id" uuid NOT NULL,
	"status" "access_request_status" DEFAULT 'PENDING' NOT NULL,
	"reason" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "auditor_access_requests" ADD CONSTRAINT "auditor_access_requests_auditor_id_users_id_fk" FOREIGN KEY ("auditor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditor_access_requests" ADD CONSTRAINT "auditor_access_requests_service_user_id_service_users_id_fk" FOREIGN KEY ("service_user_id") REFERENCES "public"."service_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditor_access_requests" ADD CONSTRAINT "auditor_access_requests_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auditor_access_requests_open_pair" ON "auditor_access_requests" USING btree ("auditor_id","service_user_id") WHERE "auditor_access_requests"."status" in ('PENDING', 'APPROVED');--> statement-breakpoint
CREATE INDEX "auditor_access_requests_auditor_idx" ON "auditor_access_requests" USING btree ("auditor_id");