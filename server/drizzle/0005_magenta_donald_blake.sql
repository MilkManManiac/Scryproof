CREATE TABLE "dm_files" (
	"id" text PRIMARY KEY NOT NULL,
	"dm_id" text NOT NULL,
	"uploader_id" text NOT NULL,
	"message_id" text,
	"storage_key" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dm_files" ADD CONSTRAINT "dm_files_dm_id_dm_channels_id_fk" FOREIGN KEY ("dm_id") REFERENCES "public"."dm_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_files" ADD CONSTRAINT "dm_files_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_files" ADD CONSTRAINT "dm_files_message_id_dm_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."dm_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dm_files_message_id_idx" ON "dm_files" USING btree ("message_id");