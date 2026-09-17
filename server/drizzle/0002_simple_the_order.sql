CREATE TABLE "reactions" (
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_message_id_user_id_emoji_pk" PRIMARY KEY("message_id","user_id","emoji")
);
--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "last_message_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "mentions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "mentions_everyone" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reactions_message_idx" ON "reactions" USING btree ("message_id");--> statement-breakpoint
-- Channels that already hold messages start with the right marker, not as "never written in".
UPDATE "channels" SET "last_message_id" = (SELECT max("id") FROM "messages" WHERE "messages"."channel_id" = "channels"."id");
