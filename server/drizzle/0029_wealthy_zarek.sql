CREATE TABLE "cuntections_days" (
	"day" integer PRIMARY KEY NOT NULL,
	"puzzle_id" text NOT NULL,
	"words" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cuntections_plays" (
	"user_id" text NOT NULL,
	"day" integer NOT NULL,
	"guesses" jsonb NOT NULL,
	"solved" boolean DEFAULT false NOT NULL,
	"mistakes" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "cuntections_plays_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "cuntections_plays" ADD CONSTRAINT "cuntections_plays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cuntections_plays_day_idx" ON "cuntections_plays" USING btree ("day");