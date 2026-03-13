CREATE TABLE `developer_apps` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`api_key_hash` text NOT NULL,
	`api_key_prefix` text NOT NULL,
	`redirect_urls` text DEFAULT '[]',
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`apple_email` text,
	`verified_email` text,
	`nickname` text,
	`name` text,
	`profile_photo_url` text,
	`bio` text,
	`contact` text,
	`sns_links` text DEFAULT '{}',
	`is_verified` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
