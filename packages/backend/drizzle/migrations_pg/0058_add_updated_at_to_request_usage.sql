ALTER TABLE "request_usage" ADD COLUMN "updated_at" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_request_usage_updated_at" ON "request_usage" USING btree ("updated_at");