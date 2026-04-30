CREATE TABLE "budget_ledger" (
	"month_key" text PRIMARY KEY NOT NULL,
	"spend_usd" real DEFAULT 0 NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL
);
