CREATE TABLE "avatars" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status_text" text;--> statement-breakpoint
ALTER TABLE "avatars" ADD CONSTRAINT "avatars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;