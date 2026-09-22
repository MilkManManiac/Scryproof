CREATE TABLE "poll_votes" (
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"option" smallint NOT NULL,
	CONSTRAINT "poll_votes_message_id_user_id_option_pk" PRIMARY KEY("message_id","user_id","option")
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "poll" jsonb;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "poll_votes_message_idx" ON "poll_votes" USING btree ("message_id");