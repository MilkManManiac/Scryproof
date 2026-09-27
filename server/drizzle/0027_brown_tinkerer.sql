CREATE TABLE "purdle_plays" (
	"user_id" text NOT NULL,
	"day" integer NOT NULL,
	"guesses" jsonb NOT NULL,
	"solved" boolean DEFAULT false NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "purdle_plays_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "purdle_plays" ADD CONSTRAINT "purdle_plays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purdle_plays_day_idx" ON "purdle_plays" USING btree ("day");