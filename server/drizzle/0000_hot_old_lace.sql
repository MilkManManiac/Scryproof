CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text,
	"uploader_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"changes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bans" (
	"server_id" text NOT NULL,
	"user_id" text NOT NULL,
	"banned_by" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bans_server_id_user_id_pk" PRIMARY KEY("server_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_overwrites" (
	"channel_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"allow" bigint DEFAULT 0 NOT NULL,
	"deny" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "channel_overwrites_channel_id_target_type_target_id_pk" PRIMARY KEY("channel_id","target_type","target_id")
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"category_id" text,
	"type" text DEFAULT 'text' NOT NULL,
	"name" text NOT NULL,
	"topic" text,
	"position" integer DEFAULT 0 NOT NULL,
	"encrypted" boolean DEFAULT false NOT NULL,
	"key_epoch" integer DEFAULT 1 NOT NULL,
	"slowmode_seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"code" text PRIMARY KEY NOT NULL,
	"server_id" text,
	"created_by" text NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"max_uses" integer,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_roles" (
	"server_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	CONSTRAINT "member_roles_server_id_user_id_role_id_pk" PRIMARY KEY("server_id","user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"server_id" text NOT NULL,
	"user_id" text NOT NULL,
	"nickname" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_server_id_user_id_pk" PRIMARY KEY("server_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text,
	"ciphertext" "bytea",
	"nonce" "bytea",
	"key_epoch" integer,
	"reply_to_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "read_states" (
	"user_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"last_read_message_id" text,
	"mention_count" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "read_states_user_id_channel_id_pk" PRIMARY KEY("user_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"position" integer DEFAULT 0 NOT NULL,
	"permissions" bigint DEFAULT 0 NOT NULL,
	"hoist" boolean DEFAULT false NOT NULL,
	"mentionable" boolean DEFAULT false NOT NULL,
	"is_everyone" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon_url" text,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"recovery_codes" jsonb,
	"avatar_url" text,
	"identity_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"disabled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bans" ADD CONSTRAINT "bans_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bans" ADD CONSTRAINT "bans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bans" ADD CONSTRAINT "bans_banned_by_users_id_fk" FOREIGN KEY ("banned_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_overwrites" ADD CONSTRAINT "channel_overwrites_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read_states" ADD CONSTRAINT "read_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read_states" ADD CONSTRAINT "read_states_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_message_idx" ON "attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "attachments_uploader_idx" ON "attachments" USING btree ("uploader_id");--> statement-breakpoint
CREATE INDEX "audit_log_server_idx" ON "audit_log" USING btree ("server_id","id");--> statement-breakpoint
CREATE INDEX "categories_server_idx" ON "categories" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "channels_server_idx" ON "channels" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "invites_server_idx" ON "invites" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "member_roles_role_idx" ON "member_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "members_user_idx" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_channel_id_idx" ON "messages" USING btree ("channel_id","id");--> statement-breakpoint
CREATE INDEX "messages_author_idx" ON "messages" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "roles_server_idx" ON "roles" USING btree ("server_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_key" ON "users" USING btree ("username");