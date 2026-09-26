ALTER TABLE "push_subscriptions" ADD COLUMN "mentions" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "messages" boolean DEFAULT false NOT NULL;