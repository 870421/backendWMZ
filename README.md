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
- `ORS_API_KEY`: OpenRouteService / HeiGIT API key used by geocoding autocomplete and pedestrian routing. Keep it only in the ignored `backend/.env` or server environment. `OPENROUTESERVICE_API_KEY` remains a fallback for older setups.
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

Calculates the fastest pedestrian route between two coordinates. This baseline route
does not take shade, sun, wind or other comfort factors into account.

### Request

Send a JSON body with the following fields:

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| `origin` | object | Yes | Must contain `lat` and `lng`. |
| `origin.lat` | number | Yes | Latitude from `-90` to `90`. |
| `origin.lng` | number | Yes | Longitude from `-180` to `180`. |
| `destination` | object | Yes | Must contain `lat` and `lng`. |
| `destination.lat` | number | Yes | Latitude from `-90` to `90`. |
| `destination.lng` | number | Yes | Longitude from `-180` to `180`. |

Example request:

```bash
curl --request POST http://localhost:3000/api/routes/fastest \
  --header "Content-Type: application/json" \
  --data '{
    "origin": { "lat": 41.6488, "lng": -0.8891 },
    "destination": { "lat": 41.656, "lng": -0.878 }
  }'
```

Equivalent request body:

```json
{
  "origin": { "lat": 41.6488, "lng": -0.8891 },
  "destination": { "lat": 41.656, "lng": -0.878 }
}
```

### Successful response

The endpoint returns `200 OK` with the normalized route:

```json
{
  "route": {
    "geometry": {
      "type": "LineString",
      "coordinates": [
        [-0.8891, 41.6488],
        [-0.884, 41.652],
        [-0.878, 41.656]
      ]
    },
    "distance": 1250.4,
    "duration": 930.2
  }
}
```

| Field | Description |
| --- | --- |
| `route.geometry` | GeoJSON `LineString`. Each position uses `[longitude, latitude]`. |
| `route.distance` | Total route distance in metres. |
| `route.duration` | Estimated walking duration in seconds. |

### Error responses

All errors use the following shape:

```json
{
  "error": {
    "message": "Route calculation timed out. Please try again."
  }
}
```

| Status | Meaning |
| --- | --- |
| `400 Bad Request` | Origin or destination is missing, non-numeric or outside the valid latitude/longitude ranges. |
| `429 Too Many Requests` | The OpenRouteService quota has been exceeded. |
| `502 Bad Gateway` | OpenRouteService is unavailable or returned an invalid response. |
| `503 Service Unavailable` | Route calculation is not configured because the server has no ORS API key. |
| `504 Gateway Timeout` | OpenRouteService did not answer within the 8-second timeout. |
| `500 Internal Server Error` | An unexpected internal error occurred. |

Provider response bodies, internal error details and API credentials are never included
in responses. Automated tests use a simulated OpenRouteService response and do not spend
provider quota.

From the workspace root, `docker compose up` loads `backend/.env` using `env_file`.
Create that ignored file from `.env.example` before starting Compose; do not overwrite
an existing key. The frontend reaches the API through Vite's development proxy.
