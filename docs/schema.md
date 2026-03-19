# Database Schema Reference

All column names follow **snake_case** convention. Tables use **singular nouns** (sisia convention). See [CONVENTIONS.md](CONVENTIONS.md) for full rules.

## Enums

### event_category

Values: `nightlife`, `music`, `art_culture`, `markets`, `food`, `comedy`, `workshops`, `community`, `sports`, `gaming`, `fitness`, `film`, `tech`, `other`

### event_status

Values: `confirmed`, `tentative`, `cancelled`, `postponed`, `rescheduled`

### availability_status

Values: `available`, `limited`, `sold_out`, `waitlist`, `early_bird`

### location_status

Values: `confirmed`, `approximate`, `unresolved`, `online`

### review_tier

Values: `auto_publish`, `quick_review`, `full_review`, `pending`

### account_category

Values: `nightlife`, `venue`, `promoter`, `artist`, `community`, `other`

### sync_status

Values: `running`, `completed`, `failed`

---

## Tables

### venue

Canonical venue directory with geocoding. Matches blead VPS schema.

| Column     | Type             | Constraints      | Description            |
| ---------- | ---------------- | ---------------- | ---------------------- |
| id         | serial           | PK               | Auto-increment ID      |
| name       | text             | UNIQUE, NOT NULL | Venue name (dedup key) |
| address    | text             |                  | Full address           |
| lat        | double precision |                  | Latitude               |
| lng        | double precision |                  | Longitude              |
| category   | text             |                  | Venue category         |
| created_at | timestamptz      | DEFAULT now()    |                        |
| updated_at | timestamptz      | DEFAULT now()    |                        |

### source_account

Instagram accounts tracked by blead.

| Column     | Type        | Constraints      | Description             |
| ---------- | ----------- | ---------------- | ----------------------- |
| id         | serial      | PK               |                         |
| username   | text        | UNIQUE, NOT NULL | IG username (dedup key) |
| full_name  | text        |                  | Display name            |
| is_active  | boolean     | DEFAULT true     |                         |
| created_at | timestamptz | DEFAULT now()    |                         |

### source_post

Instagram posts scraped by blead.

| Column         | Type        | Constraints         | Description              |
| -------------- | ----------- | ------------------- | ------------------------ |
| id             | serial      | PK                  |                          |
| account_id     | integer     | FK → source_account |                          |
| shortcode      | text        | UNIQUE, NOT NULL    | IG shortcode (dedup key) |
| post_url       | text        | NOT NULL            | Full IG URL              |
| caption        | text        |                     | Post caption             |
| posted_at      | timestamptz |                     | Original post time       |
| image_url      | text        |                     | Image URL                |
| likes_count    | integer     | DEFAULT 0           |                          |
| comments_count | integer     | DEFAULT 0           |                          |
| created_at     | timestamptz | DEFAULT now()       |                          |

### event

Core event data — the primary table for the platform.

| Column              | Type                | Constraints         | Description             |
| ------------------- | ------------------- | ------------------- | ----------------------- |
| id                  | serial              | PK                  |                         |
| source_post_id      | integer             | FK → source_post    |                         |
| source_account_id   | integer             | FK → source_account |                         |
| venue_id            | integer             | FK → venue          | Linked venue            |
| title               | text                | NOT NULL            | Event title             |
| description         | text                |                     | Event description       |
| event_date          | date                | NOT NULL            | Start date              |
| event_end_date      | date                |                     | End date                |
| event_time          | text                |                     | Start time (HH:MM)      |
| end_time            | text                |                     | End time                |
| venue_name          | text                |                     | Denormalized venue name |
| venue_address       | text                |                     | Denormalized address    |
| venue_lat           | real                |                     | Denormalized lat        |
| venue_lng           | real                |                     | Denormalized lng        |
| location_status     | location_status     | DEFAULT 'confirmed' |                         |
| is_free             | boolean             | DEFAULT true        |                         |
| price               | numeric(10,2)       |                     | Single price            |
| price_min           | numeric(10,2)       |                     | Range min               |
| price_max           | numeric(10,2)       |                     | Range max               |
| price_notes         | text                |                     | E.g. "₱500 w/ 1 drink"  |
| signup_url          | text                |                     | Registration link       |
| category            | event_category      | DEFAULT 'other'     |                         |
| artists             | jsonb               |                     | Artist names array      |
| event_status        | event_status        | DEFAULT 'confirmed' |                         |
| availability_status | availability_status | DEFAULT 'available' |                         |
| is_recurring        | boolean             | DEFAULT false       |                         |
| recurrence_pattern  | text                |                     | E.g. "every Saturday"   |
| completeness_score  | numeric(3,2)        |                     | Data quality 0-1        |
| confidence          | numeric(3,2)        |                     | AI confidence 0-1       |
| review_tier         | review_tier         | DEFAULT 'pending'   |                         |
| image_url           | text                |                     | Primary image           |
| source_username     | text                |                     | Denormalized username   |
| event_hash          | text                | UNIQUE              | Dedup key               |
| created_at          | timestamptz         | DEFAULT now()       |                         |
| updated_at          | timestamptz         | DEFAULT now()       |                         |

### sub_event

Multi-act lineups and schedules within an event.

| Column      | Type    | Constraints          | Description       |
| ----------- | ------- | -------------------- | ----------------- |
| id          | serial  | PK                   |                   |
| event_id    | integer | FK → event, NOT NULL | Parent event      |
| title       | text    | NOT NULL             | Act/schedule name |
| event_date  | date    |                      | Sub-event date    |
| event_time  | text    |                      | Start time        |
| end_time    | text    |                      | End time          |
| description | text    |                      |                   |

### account

Platform accounts for authentication. Named `account` (not `user`) to avoid PostgreSQL reserved word.

| Column        | Type         | Constraints      | Description |
| ------------- | ------------ | ---------------- | ----------- |
| id            | serial       | PK               |             |
| email         | varchar(255) | UNIQUE, NOT NULL |             |
| username      | varchar(50)  | UNIQUE, NOT NULL |             |
| password_hash | text         | NOT NULL         | bcrypt hash |
| display_name  | text         |                  |             |
| avatar_url    | text         |                  |             |
| created_at    | timestamptz  | DEFAULT now()    |             |
| updated_at    | timestamptz  | DEFAULT now()    |             |

### saved_event

Many-to-many relationship between accounts and events.

| Column     | Type        | Constraints            | Description |
| ---------- | ----------- | ---------------------- | ----------- |
| id         | serial      | PK                     |             |
| account_id | integer     | FK → account, NOT NULL |             |
| event_id   | integer     | FK → event, NOT NULL   |             |
| saved_at   | timestamptz | DEFAULT now()          |             |

### account_preference

Account's preferred event categories.

| Column               | Type        | Constraints                    | Description |
| -------------------- | ----------- | ------------------------------ | ----------- |
| id                   | serial      | PK                             |             |
| account_id           | integer     | FK → account, UNIQUE, NOT NULL |             |
| preferred_categories | jsonb       | DEFAULT '[]'                   |             |
| updated_at           | timestamptz | DEFAULT now()                  |             |

### sync_log

Tracks each ingest run from blead SQLite.

| Column            | Type        | Constraints       | Description             |
| ----------------- | ----------- | ----------------- | ----------------------- |
| id                | serial      | PK                |                         |
| started_at        | timestamptz | DEFAULT now()     |                         |
| completed_at      | timestamptz |                   |                         |
| status            | sync_status | DEFAULT 'running' |                         |
| accounts_synced   | integer     | DEFAULT 0         |                         |
| posts_synced      | integer     | DEFAULT 0         |                         |
| events_synced     | integer     | DEFAULT 0         |                         |
| venues_synced     | integer     | DEFAULT 0         |                         |
| sub_events_synced | integer     | DEFAULT 0         |                         |
| error_message     | text        |                   | Error details if failed |

---

## Key Indexes

- `event.event_hash` — UNIQUE, deduplication
- `event.event_date` — Range queries for upcoming events
- `event.category` — Category filtering
- `event.event_status` — Status filtering
- `event.venue_id` — Venue lookups
- `source_post.shortcode` — UNIQUE, dedup
- `source_account.username` — UNIQUE, dedup
- `venue.name` — UNIQUE, dedup
- `saved_event(account_id, event_id)` — Unique bookmark pairs

## Relations

- `event` → `venue` (many-to-one via `venue_id`)
- `event` → `source_post` (many-to-one via `source_post_id`)
- `event` → `source_account` (many-to-one via `source_account_id`)
- `sub_event` → `event` (many-to-one via `event_id`)
- `saved_event` → `account` + `event` (junction table)
- `account_preference` → `account` (one-to-one)
