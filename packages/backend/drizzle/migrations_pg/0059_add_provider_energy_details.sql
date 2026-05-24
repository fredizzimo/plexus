ALTER TABLE "request_usage" ADD COLUMN "avg_power_watts" real;--> statement-breakpoint
ALTER TABLE "request_usage" ADD COLUMN "duration_seconds" real;--> statement-breakpoint
ALTER TABLE "request_usage" ADD COLUMN "attribution_method" text;--> statement-breakpoint
ALTER TABLE "request_usage" ADD COLUMN "attribution_ratio" real;--> statement-breakpoint
ALTER TABLE "request_usage" ADD COLUMN "ratio_was_capped" integer;--> statement-breakpoint
ALTER TABLE "request_usage" ADD COLUMN "uncapped_energy_kwh" real;