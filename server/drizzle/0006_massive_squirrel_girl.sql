ALTER TABLE "device_keys" ADD COLUMN "endorsed_by" text;--> statement-breakpoint
ALTER TABLE "device_keys" ADD COLUMN "endorsement" text;--> statement-breakpoint
ALTER TABLE "dm_message_keys" ADD COLUMN "wrapped_by" text;