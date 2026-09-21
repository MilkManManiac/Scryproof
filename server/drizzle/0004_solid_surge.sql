ALTER TABLE "dm_messages" ADD COLUMN "reaction_to" text;--> statement-breakpoint
ALTER TABLE "dm_messages" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "dm_messages_reaction_to_idx" ON "dm_messages" USING btree ("reaction_to");