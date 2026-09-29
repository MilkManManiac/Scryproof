CREATE TABLE "bee_days" (
	"day" integer PRIMARY KEY NOT NULL,
	"letters" text NOT NULL,
	"max" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bee_plays" (
	"user_id" text NOT NULL,
	"day" integer NOT NULL,
	"words" jsonb NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "bee_plays_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "bee_plays" ADD CONSTRAINT "bee_plays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bee_plays_day_idx" ON "bee_plays" USING btree ("day");