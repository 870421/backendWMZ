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

