CREATE TABLE "kicks" (
	"server_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kicked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "kicks_server_id_user_id_pk" PRIMARY KEY("server_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "kicks" ADD CONSTRAINT "kicks_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kicks" ADD CONSTRAINT "kicks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Kicks made before this table existed, from the audit log, so an invite from
-- before one of them does not let that person back either.
INSERT INTO "kicks" ("server_id", "user_id", "kicked_at")
SELECT a."server_id", a."target_id", max(a."created_at")
FROM "audit_log" a
JOIN "users" u ON u."id" = a."target_id"
WHERE a."action" = 'member.kick'
GROUP BY a."server_id", a."target_id"
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- No invite lives longer than 48 hours, the ones already out included.
UPDATE "invites"
SET "expires_at" = LEAST(COALESCE("expires_at", "created_at" + interval '48 hours'), "created_at" + interval '48 hours');
