CREATE TABLE "conveyor_days" (
	"day" integer PRIMARY KEY NOT NULL,
	"items" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conveyor_plays" (
	"user_id" text NOT NULL,
	"day" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"guesses" jsonb NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "conveyor_plays_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "conveyor_plays" ADD CONSTRAINT "conveyor_plays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conveyor_plays_day_idx" ON "conveyor_plays" USING btree ("day");