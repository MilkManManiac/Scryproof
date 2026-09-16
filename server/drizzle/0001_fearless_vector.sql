CREATE TABLE "category_overwrites" (
	"category_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"allow" bigint DEFAULT 0 NOT NULL,
	"deny" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "category_overwrites_category_id_target_type_target_id_pk" PRIMARY KEY("category_id","target_type","target_id")
);
--> statement-breakpoint
ALTER TABLE "category_overwrites" ADD CONSTRAINT "category_overwrites_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;