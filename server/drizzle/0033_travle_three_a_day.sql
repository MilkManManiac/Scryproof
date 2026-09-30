-- Three Travhole routes a day (Wes, 2026-09-30). Every route played so far
-- becomes leg 0 of its day. Written by hand: drizzle-kit put the new keys
-- before the columns they are on, and cannot name the old travle_days key
-- (Postgres called it travle_days_pkey, from "day" integer PRIMARY KEY in 0031).
ALTER TABLE "travle_days" ADD COLUMN "leg" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "travle_plays" ADD COLUMN "leg" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "travle_days" DROP CONSTRAINT "travle_days_pkey";--> statement-breakpoint
ALTER TABLE "travle_plays" DROP CONSTRAINT "travle_plays_user_id_day_pk";--> statement-breakpoint
ALTER TABLE "travle_days" ADD CONSTRAINT "travle_days_day_leg_pk" PRIMARY KEY("day","leg");--> statement-breakpoint
ALTER TABLE "travle_plays" ADD CONSTRAINT "travle_plays_user_id_day_leg_pk" PRIMARY KEY("user_id","day","leg");
