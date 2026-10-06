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

## Documentación obligatoria por PBI

- When a PBI is finished, and before opening its pull request, add its entry at the top of the
  "Registro de PBIs" in `docs/DECISIONS.md`, with: title, date, branch and status (En revisión /
  Fusionada #N); what was done, in plain language; the satisfaction conditions checked, with where
  each one is verified (test, command or query); real data and results; technical changes
  (tables, migrations, npm commands, environment variables, endpoints); links to the ADRs taken;
  pending items and risks for later PBIs; and how to verify it by hand.
- Record every non-obvious technical decision as a new ADR in the same file. If a decision
  changes, add a new ADR and mark the previous one as "Sustituido por ADR-00X". Never delete the
  history.
- Update EVERY Markdown file affected by the change: `DATA_SOURCES.md` if sources or data change,
  `README.md` if start-up, environment variables, commands, schema or the manual checklist change,
  and the API documentation if endpoints change.
- Before closing the PBI, grep all Markdown files for the terms and figures that changed, so no
  outdated information is left anywhere.
- The pull request description lives in `PR-<pbi>.md` (local only, ignored by Git) and is a short
  summary that links to the PBI entry in `docs/DECISIONS.md`.
