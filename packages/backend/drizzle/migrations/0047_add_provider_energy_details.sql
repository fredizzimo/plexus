ALTER TABLE `request_usage` ADD `avg_power_watts` real;--> statement-breakpoint
ALTER TABLE `request_usage` ADD `duration_seconds` real;--> statement-breakpoint
ALTER TABLE `request_usage` ADD `attribution_method` text;--> statement-breakpoint
ALTER TABLE `request_usage` ADD `attribution_ratio` real;--> statement-breakpoint
ALTER TABLE `request_usage` ADD `ratio_was_capped` integer;--> statement-breakpoint
ALTER TABLE `request_usage` ADD `uncapped_energy_kwh` real;