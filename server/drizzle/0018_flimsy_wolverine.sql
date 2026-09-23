ALTER TABLE "dm_channels" ADD COLUMN "kind" text DEFAULT 'pair' NOT NULL;--> statement-breakpoint
ALTER TABLE "dm_channels" ADD COLUMN "title" text;