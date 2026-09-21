CREATE TABLE "device_keys" (
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"identity_key" text NOT NULL,
	"dm_key" text NOT NULL,
	"signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_keys_user_id_device_id_pk" PRIMARY KEY("user_id","device_id")
);
--> statement-breakpoint
CREATE TABLE "dm_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"pair_key" text,
	"last_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dm_members" (
	"dm_id" text NOT NULL,
	"user_id" text NOT NULL,
	"last_read_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dm_members_dm_id_user_id_pk" PRIMARY KEY("dm_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "dm_message_keys" (
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"iv" "bytea" NOT NULL,
	"wrapped" "bytea" NOT NULL,
	CONSTRAINT "dm_message_keys_message_id_user_id_device_id_pk" PRIMARY KEY("message_id","user_id","device_id")
);
--> statement-breakpoint
CREATE TABLE "dm_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"dm_id" text NOT NULL,
	"author_id" text NOT NULL,
	"sender_device_id" text NOT NULL,
	"iv" "bytea",
	"ciphertext" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "device_keys" ADD CONSTRAINT "device_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_members" ADD CONSTRAINT "dm_members_dm_id_dm_channels_id_fk" FOREIGN KEY ("dm_id") REFERENCES "public"."dm_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_members" ADD CONSTRAINT "dm_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_message_keys" ADD CONSTRAINT "dm_message_keys_message_id_dm_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."dm_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_messages" ADD CONSTRAINT "dm_messages_dm_id_dm_channels_id_fk" FOREIGN KEY ("dm_id") REFERENCES "public"."dm_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_messages" ADD CONSTRAINT "dm_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dm_channels_pair_key" ON "dm_channels" USING btree ("pair_key");--> statement-breakpoint
CREATE INDEX "dm_members_user_idx" ON "dm_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dm_messages_dm_id_idx" ON "dm_messages" USING btree ("dm_id","id");