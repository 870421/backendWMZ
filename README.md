# WeatherMapZ Backend

Node.js + Express backend for WeatherMapZ.

## Requirements

- Node.js 22 or newer
- npm
- PostgreSQL with PostGIS for database-backed development

## Setup

```bash
npm install
cp .env.example .env
```

## Development

```bash
npm run dev
```

The API runs on <http://localhost:3000/api>.

## Test

```bash
npm test
```

## Checks

```bash
npm run check
```

## Production Start

```bash
npm start
```

## Environment

- `NODE_ENV`: runtime environment.
- `PORT`: HTTP port. Default local value: `3000`.
- `CORS_ORIGIN`: allowed frontend origin. Default local value: `http://localhost:5173`.
- `DATABASE_URL`: PostgreSQL/PostGIS connection string.
- `ORS_API_KEY`: OpenRouteService / HeiGIT API key used by geocoding autocomplete. Keep it only in the ignored `backend/.env` or server environment. `OPENROUTESERVICE_API_KEY` remains a fallback for older setups.
- `OPENROUTESERVICE_GEOCODING_BASE_URL`: geocoding API base URL. Default local value: `https://api.heigit.org/pelias/v1`.
- `OPENROUTESERVICE_DIRECTIONS_BASE_URL`: directions API base URL. Default local value: `https://api.openrouteservice.org/v2/directions`.

## PBI-1 autocomplete contract

`GET /api/geocoding/autocomplete?text=Plaza%20del%20Pilar&limit=5`

Returns `{ results: [{ id, label, lat, lng, source: "search" }] }`.
Text shorter than 3 characters returns an empty list; maximum length is 200.
Limit defaults to 5 and must be an integer from 1 to 10. Invalid queries return 400.
Provider features are validated, normalized and deduplicated by the adapter.
Search uses Zaragoza focus and a Spain filter. It does not enforce a city boundary.

Errors use `{ error: { message } }`: 503 for missing configuration, 429 for provider
quota limits, 504 for the 8-second provider timeout, and 502 for provider/network or
invalid-response failures. Provider bodies and credentials are never forwarded.
Automated tests mock external requests.

## PBI-2 fastest route contract

`POST /api/routes/fastest`

```json
{
  "origin": { "lat": 41.6488, "lng": -0.8891 },
  "destination": { "lat": 41.656, "lng": -0.878 }
}
```

Returns `{ "route": { "geometry", "distance", "duration" } }`, where geometry is
a GeoJSON `LineString`, distance is expressed in metres and duration in seconds.
Missing, non-numeric or out-of-range coordinates return 400.

From the workspace root, `docker compose up` loads `backend/.env` using `env_file`.
Create that ignored file from `.env.example` before starting Compose; do not overwrite
an existing key. The frontend reaches the API through Vite's development proxy.
