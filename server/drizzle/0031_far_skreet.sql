CREATE TABLE "queens_days" (
	"day" integer PRIMARY KEY NOT NULL,
	"regions" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queens_plays" (
	"user_id" text NOT NULL,
	"day" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"seconds" integer,
	"queens" jsonb,
	CONSTRAINT "queens_plays_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "thrice_days" (
	"day" integer PRIMARY KEY NOT NULL,
	"set_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thrice_plays" (
	"user_id" text NOT NULL,
	"day" integer NOT NULL,
	"tries" jsonb NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "thrice_plays_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "travle_days" (
	"day" integer PRIMARY KEY NOT NULL,
	"from_code" text NOT NULL,
	"to_code" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "travle_plays" (
	"user_id" text NOT NULL,
	"day" integer NOT NULL,
	"guesses" jsonb NOT NULL,
	"solved" boolean DEFAULT false NOT NULL,
	"extra" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "travle_plays_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "queens_plays" ADD CONSTRAINT "queens_plays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thrice_plays" ADD CONSTRAINT "thrice_plays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travle_plays" ADD CONSTRAINT "travle_plays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "queens_plays_day_idx" ON "queens_plays" USING btree ("day");--> statement-breakpoint
CREATE INDEX "thrice_plays_day_idx" ON "thrice_plays" USING btree ("day");--> statement-breakpoint
CREATE INDEX "travle_plays_day_idx" ON "travle_plays" USING btree ("day");