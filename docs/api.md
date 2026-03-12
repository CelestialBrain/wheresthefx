# API Reference

Base URL: `https://api.wheresthefx.com/api` (production) or `http://localhost:3001/api` (local)

All responses use **snake_case** keys (auto-converted by middleware). Common envelope:

```json
{
  "data": [...],
  "pagination": { "page": 1, "limit": 20, "total": 230, "total_pages": 12 }
}
```

---

## Authentication

### POST /auth/register

Create a new account.

**Request:**

```json
{
  "email": "user@example.com",
  "username": "myuser",
  "password": "securepass123"
}
```

**Response (201):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "myuser"
  }
}
```

### POST /auth/login

Authenticate and receive JWT token.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "securepass123"
}
```

**Response (200):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "myuser"
  }
}
```

### GET /auth/me

Get current account profile. Requires `Authorization: Bearer <token>`.

**Response (200):**

```json
{
  "id": 1,
  "email": "user@example.com",
  "username": "myuser",
  "display_name": null,
  "created_at": "2026-03-12T07:30:00.000Z"
}
```

---

## Events

### GET /events

List events with filtering and pagination.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `category` | string | Filter by category enum value |
| `search` | string | Search in title, description, venue name, address |
| `is_free` | boolean | Filter free events (`true`/`false`) |
| `date_from` | string | Start date (YYYY-MM-DD) |
| `date_to` | string | End date (YYYY-MM-DD) |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max: 100) |

**Response (200):**

```json
{
  "data": [
    {
      "id": 1,
      "title": "Salcedo Market",
      "event_date": "2026-03-15",
      "event_time": "07:00",
      "end_time": "14:00",
      "description": "Weekend community market...",
      "venue_name": "Jaime Velasquez Park",
      "venue_address": "Salcedo Village, Makati",
      "venue_lat": 14.5609,
      "venue_lng": 121.0224,
      "is_free": true,
      "category": "markets",
      "image_url": "https://scontent...",
      "source_username": "salcedomarket",
      "event_hash": "a1b2c3d4...",
      "is_saved": false
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 230,
    "total_pages": 12
  }
}
```

### GET /events/upcoming

Get upcoming events (filtered to future dates).

**Query: `?limit=50`**

### GET /events/map

Get events with geocoding for map display. Returns only events that have `venue_lat` and `venue_lng`:

```json
{
  "data": [
    {
      "id": 1,
      "title": "Salcedo Market",
      "event_date": "2026-03-15",
      "event_time": "07:00",
      "venue_name": "Jaime Velasquez Park",
      "venue_lat": 14.5609,
      "venue_lng": 121.0224,
      "category": "markets",
      "is_free": true,
      "image_url": "https://..."
    }
  ]
}
```

### GET /events/:id

Get full event detail with related data.

**Response includes:** venue info, sub-events, source post, source account.

---

## Venues

### GET /venues

List all venues with event counts.

```json
{
  "data": [
    {
      "id": 1,
      "name": "Jaime Velasquez Park",
      "address": "Salcedo Village, Makati",
      "category": null,
      "lat": 14.5609,
      "lng": 121.0224,
      "event_count": 3
    }
  ]
}
```

### GET /venues/:id

Get venue detail.

### GET /venues/:id/events

Get all events at a specific venue.

---

## Categories

### GET /categories

Get all categories with upcoming event counts and display metadata.

```json
{
  "data": [
    { "value": "music", "label": "Live Music", "emoji": "🎵", "count": 12 },
    {
      "value": "markets",
      "label": "Markets & Fairs",
      "emoji": "🛍️",
      "count": 4
    },
    { "value": "nightlife", "label": "Nightlife", "emoji": "🌙", "count": 0 }
  ]
}
```

---

## User Endpoints

All require `Authorization: Bearer <token>`.

### GET /users/me/saved

Get the current account's saved events.

### POST /users/me/saved

Toggle save/unsave an event.

**Request:**

```json
{ "event_id": 42 }
```

**Response:**

```json
{ "saved": true }
```

### GET /users/me/preferences

Get account's preferred categories.

### PUT /users/me/preferences

Update preferred categories.

**Request:**

```json
{ "categories": ["music", "nightlife", "food"] }
```

---

## Image Proxy

### GET /images/proxy

Proxy Instagram images with local cache fallback.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `url` | string | Required. Instagram CDN URL |
| `shortcode` | string | Optional. Post shortcode for cache lookup |

Returns the image binary with correct content-type headers.

**Why it exists:** Instagram CDN URLs expire after ~24 hours. This proxy first tries fetching the CDN URL. If it fails (403/410), it falls back to locally cached images stored by blead at `BLEAD_IMAGE_DIR/{shortcode}/`.

---

## Error Responses

All errors follow:

```json
{
  "error": "Human-readable error message"
}
```

Common status codes:

- `400` — Bad request / validation error
- `401` — Missing or invalid JWT token
- `404` — Resource not found
- `409` — Conflict (e.g., duplicate email/username)
- `500` — Internal server error

## Authentication Header

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

JWT tokens expire after 7 days. The token contains `{ userId, email }`.
