# WeatherMapZ Backend - Codex Instructions

This repository contains the WeatherMapZ backend.

Before substantial changes, read the global WeatherMapZ documentation,
especially:

- docs/ARCHITECTURE.md
- docs/DATA_SOURCES.md
- docs/ROUTING.md
- docs/DECISIONS.md

## Stack

- Node.js
- Express
- Sequelize
- PostgreSQL
- PostGIS

Testing:

- Jest
- Supertest

## Responsibilities

The backend handles:

- REST API
- routing
- comfort calculations
- geographic processing
- database access
- weather integration
- shadow/sun calculations
- wind exposure
- external API integrations

## Architecture

Keep clear separation between:

HTTP/API
    ↓
Application/services
    ↓
Domain/business logic
    ↓
Repositories/integrations
    ↓
PostgreSQL/PostGIS / external APIs

Do not place complex business logic inside Express controllers.

## GIS

Use PostgreSQL/PostGIS for appropriate spatial operations.

Avoid inefficient geographic processing in JavaScript when PostGIS
provides an appropriate operation.

## External integrations

Keep external providers isolated behind services/adapters.

Potential integrations:

- OpenRouteService
- Open-Meteo
- IDEZAR
- OpenStreetMap

Core business logic should not depend directly on provider-specific
response formats when avoidable.

## Routing

The routing model must balance travel time and climatic comfort.

Potential factors:

- time
- distance
- shade
- sun
- temperature
- wind
- vegetation

The final cost function and weights are NOT defined.

Do not invent them.

## Unresolved data

Never assume the meaning of `Alturas_Edificios.etiqueta`.

Never assume Zaragoza's shadow calculations are publicly accessible.

Check `docs/DECISIONS.md` before implementing functionality depending on
an unresolved question.

## Testing

Routing/domain logic should be testable independently from Express and
external APIs.

Use Jest and Supertest where appropriate.

Minimum automated coverage: 50%.
Target: 75%.

## Configuration

Never hardcode:

- credentials
- API keys
- database passwords
- environment-specific configuration

Use environment variables and maintain `.env.example`.