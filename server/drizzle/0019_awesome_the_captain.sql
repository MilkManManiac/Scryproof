CREATE TABLE "channel_epochs" (
	"channel_id" text NOT NULL,
	"epoch" integer NOT NULL,
	"creator_id" text NOT NULL,
	"creator_device_id" text NOT NULL,
	"commitment" "bytea" NOT NULL,
	"signature" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_epochs_channel_id_epoch_pk" PRIMARY KEY("channel_id","epoch")
);
--> statement-breakpoint
CREATE TABLE "channel_keys" (
	"channel_id" text NOT NULL,
	"epoch" integer NOT NULL,
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"wrapper_id" text NOT NULL,
	"wrapper_device_id" text NOT NULL,
	"iv" "bytea" NOT NULL,
	"wrapped" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_keys_channel_id_epoch_user_id_device_id_pk" PRIMARY KEY("channel_id","epoch","user_id","device_id")
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sender_device_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "signature" "bytea";--> statement-breakpoint
ALTER TABLE "channel_epochs" ADD CONSTRAINT "channel_epochs_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_epochs" ADD CONSTRAINT "channel_epochs_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_keys" ADD CONSTRAINT "channel_keys_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_keys" ADD CONSTRAINT "channel_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_keys_device_idx" ON "channel_keys" USING btree ("user_id","device_id");