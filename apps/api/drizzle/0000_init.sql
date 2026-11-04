CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run" (
	"id" text PRIMARY KEY NOT NULL,
	"option_id" text NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"prompt" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"explanation" text,
	"candidates" jsonb,
	"proposed_candidate_id" text,
	"result_version_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_step" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"seq" integer NOT NULL,
	"tool" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"duration_ms" integer NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "context_building" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"geom" geometry(Polygon,4326) NOT NULL,
	"height_m" real NOT NULL,
	"height_source" text NOT NULL,
	"data_source" text NOT NULL,
	"confidence" real,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_option" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"rule_set_id" text,
	"head_version_id" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"non_compliant_study" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_version_id" text NOT NULL,
	"compliance" jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"yield" jsonb NOT NULL,
	"builder_version" text NOT NULL,
	"rule_set_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_recipe_version_id_unique" UNIQUE("recipe_version_id")
);
--> statement-breakpoint
CREATE TABLE "export" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_version_id" text NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jurisdiction" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"default_crs" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'pilot' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plot" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"geom" geometry(Polygon,4326) NOT NULL,
	"zone_id" text,
	"edge_classes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"area_m2" double precision GENERATED ALWAYS AS (ST_Area(ST_Transform(geom, 32628))) STORED,
	"origin_lon" double precision NOT NULL,
	"origin_lat" double precision NOT NULL,
	"crs" text DEFAULT 'EPSG:32628' NOT NULL,
	"source" text DEFAULT 'drawn' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plot_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"jurisdiction_id" text NOT NULL,
	"rule_set_id" text,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_version" (
	"id" text PRIMARY KEY NOT NULL,
	"option_id" text NOT NULL,
	"parent_id" text,
	"schema_version" integer NOT NULL,
	"recipe" jsonb NOT NULL,
	"author_kind" text NOT NULL,
	"author_id" text,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ref_building" (
	"id" text PRIMARY KEY NOT NULL,
	"geom" geometry(Polygon,4326) NOT NULL,
	"height_m" real NOT NULL,
	"height_source" text NOT NULL,
	"data_source" text NOT NULL,
	"confidence" real,
	"source_id" text,
	"priority" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_set" (
	"id" text PRIMARY KEY NOT NULL,
	"jurisdiction_id" text NOT NULL,
	"version" text NOT NULL,
	"content" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "site_import" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"stats" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "terrain_tile" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"bbox" geometry(Polygon,4326) NOT NULL,
	"storage_key" text NOT NULL,
	"resolution_m" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "yield_assumption" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"sale_price_per_m2" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"build_cost_per_m2" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"land_cost" double precision,
	"soft_cost_ratio" double precision,
	"parking_cost_per_space" double precision,
	"unit_sizes_m2" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "yield_assumption_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_option_id_design_option_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."design_option"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_step" ADD CONSTRAINT "agent_step_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_building" ADD CONSTRAINT "context_building_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_option" ADD CONSTRAINT "design_option_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_option" ADD CONSTRAINT "design_option_rule_set_id_rule_set_id_fk" FOREIGN KEY ("rule_set_id") REFERENCES "public"."rule_set"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_recipe_version_id_recipe_version_id_fk" FOREIGN KEY ("recipe_version_id") REFERENCES "public"."recipe_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export" ADD CONSTRAINT "export_recipe_version_id_recipe_version_id_fk" FOREIGN KEY ("recipe_version_id") REFERENCES "public"."recipe_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plot" ADD CONSTRAINT "plot_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_jurisdiction_id_jurisdiction_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdiction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_rule_set_id_rule_set_id_fk" FOREIGN KEY ("rule_set_id") REFERENCES "public"."rule_set"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_version" ADD CONSTRAINT "recipe_version_option_id_design_option_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."design_option"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_set" ADD CONSTRAINT "rule_set_jurisdiction_id_jurisdiction_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdiction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_import" ADD CONSTRAINT "site_import_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terrain_tile" ADD CONSTRAINT "terrain_tile_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yield_assumption" ADD CONSTRAINT "yield_assumption_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_run_org_created" ON "agent_run" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "context_building_geom_gist" ON "context_building" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "context_building_project" ON "context_building" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_org_user" ON "membership" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "plot_geom_gist" ON "plot" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "project_org" ON "project" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "recipe_version_option" ON "recipe_version" USING btree ("option_id");--> statement-breakpoint
CREATE INDEX "recipe_version_recipe_gin" ON "recipe_version" USING gin ("recipe" jsonb_path_ops);--> statement-breakpoint
CREATE INDEX "ref_building_geom_gist" ON "ref_building" USING gist ("geom");--> statement-breakpoint
CREATE UNIQUE INDEX "rule_set_version" ON "rule_set" USING btree ("jurisdiction_id","version");--> statement-breakpoint
CREATE INDEX "rule_set_content_gin" ON "rule_set" USING gin ("content" jsonb_path_ops);--> statement-breakpoint
CREATE INDEX "terrain_tile_bbox_gist" ON "terrain_tile" USING gist ("bbox");