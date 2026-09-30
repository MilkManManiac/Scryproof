CREATE TABLE "rounds_days" (
	"game" text NOT NULL,
	"day" integer NOT NULL,
	"items" jsonb NOT NULL,
	CONSTRAINT "rounds_days_game_day_pk" PRIMARY KEY("game","day")
);
--> statement-breakpoint
CREATE TABLE "rounds_plays" (
	"game" text NOT NULL,
	"user_id" text NOT NULL,
	"day" integer NOT NULL,
	"guesses" jsonb NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "rounds_plays_game_user_id_day_pk" PRIMARY KEY("game","user_id","day")
);
--> statement-breakpoint
ALTER TABLE "rounds_plays" ADD CONSTRAINT "rounds_plays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rounds_plays_game_day_idx" ON "rounds_plays" USING btree ("game","day");