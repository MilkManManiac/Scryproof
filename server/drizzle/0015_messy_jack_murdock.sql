CREATE TABLE "trackers" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"started_by" text NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"turn" integer DEFAULT 0 NOT NULL,
	"entries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trackers" ADD CONSTRAINT "trackers_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackers" ADD CONSTRAINT "trackers_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;