ALTER TABLE `request_usage` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_request_usage_updated_at` ON `request_usage` (`updated_at`);