CREATE TABLE "server_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"requester_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_requests_requester_id_unique" UNIQUE("requester_id")
);
--> statement-breakpoint
ALTER TABLE "server_requests" ADD CONSTRAINT "server_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;