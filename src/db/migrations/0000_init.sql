CREATE TABLE "agents" (
	"scene_id" text NOT NULL,
	"timestamp_sec" real NOT NULL,
	"agent_id" text NOT NULL,
	"label" text NOT NULL,
	"pos_2d_x" real NOT NULL,
	"pos_2d_y" real NOT NULL,
	"pos_3d_x" real NOT NULL,
	"pos_3d_y" real NOT NULL,
	"pos_3d_z" real NOT NULL,
	"velocity_x" real NOT NULL,
	"velocity_y" real NOT NULL,
	"velocity_z" real NOT NULL,
	"heading_deg" real NOT NULL,
	"confidence" real NOT NULL,
	"intent" text,
	"trajectory_forecast" jsonb,
	CONSTRAINT "agents_scene_id_timestamp_sec_agent_id_pk" PRIMARY KEY("scene_id","timestamp_sec","agent_id")
);
--> statement-breakpoint
CREATE TABLE "frames" (
	"scene_id" text NOT NULL,
	"timestamp_sec" real NOT NULL,
	"scene_context" text,
	"projection_matrix" jsonb,
	CONSTRAINT "frames_scene_id_timestamp_sec_pk" PRIMARY KEY("scene_id","timestamp_sec")
);
--> statement-breakpoint
CREATE TABLE "intent_log" (
	"scene_id" text NOT NULL,
	"timestamp_sec" real NOT NULL,
	"seq" integer NOT NULL,
	"message" text NOT NULL,
	CONSTRAINT "intent_log_scene_id_timestamp_sec_seq_pk" PRIMARY KEY("scene_id","timestamp_sec","seq")
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"video_url" text NOT NULL,
	"duration_sec" real NOT NULL,
	"fps" real NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"camera_intrinsics" jsonb,
	"camera_extrinsics" jsonb,
	"bake_meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frames" ADD CONSTRAINT "frames_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_log" ADD CONSTRAINT "intent_log_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_scene_idx" ON "agents" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "agents_agent_idx" ON "agents" USING btree ("scene_id","agent_id");--> statement-breakpoint
CREATE INDEX "frames_scene_idx" ON "frames" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "intent_log_scene_idx" ON "intent_log" USING btree ("scene_id");