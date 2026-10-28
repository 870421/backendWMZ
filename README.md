# WeatherMapZ Backend

Backend de WeatherMapZ con Node.js + Express.

## Requisitos

- Node.js 22 o superior
- npm
- Docker (para la base de datos PostgreSQL/PostGIS que usan los usuarios y los imports de datos
  urbanos)

## Instalación

```bash
npm install
cp .env.example .env      # después, rellena DB_PASSWORD, ORS_API_KEY y JWT_SECRET
```

## Base de datos (PostGIS)

`docker-compose.yml` arranca `postgis/postgis:17-3.5` con un volumen persistente `pgdata`. En el
primer arranque también crea la base de datos de test (`DB_TEST_NAME`). Compose lee los valores
`DB_*` de `backend/.env`.

```bash
docker compose up -d db       # o: npm run db:up
npm run db:migrate            # base de datos de desarrollo
npm run db:migrate:test       # base de datos de test (los tests de integración también lo hacen solos)
```

Las migraciones están en `src/repositories/migrations` (sequelize-cli) y `npm run db:migrate`
aplica todas las pendientes, en orden:

| Migración | Crea |
| --- | --- |
| `20261006000001-enable-postgis` | extensión `postgis` |
| `20261006000002-create-import-tracking` | `import_runs`, `import_rejections` |
| `20261006000003-create-urban-elements` | `buildings`, `trees`, `street_segments` |
| `20261006000004-add-building-height-suspicious` | `buildings.height_suspicious` |
| `20261009000001-create-users` | `users` (PBI-4) |
| `20261019000001-create-associations` | `segment_trees`, `segment_buildings`, `association_runs`, `unassociated_elements` e índice `street_segments_geog_gist` |

Una base de datos que ya tenía las tres primeras migraciones solo necesita volver a ejecutar
`npm run db:migrate`; la columna nueva se añade con `false` en las filas existentes y
`npm run import:buildings` la rellena. Una base de datos con los datos de la PBI-3.1 ya cargados
solo necesita `npm run db:migrate` (aplica `20261019000001-create-associations`) y
`npm run associate`; no hace falta reimportar.

Todas las geometrías se guardan en EPSG:4326 con índices GIST.

### Tabla `buildings`

| Columna | Tipo | Descripción |
| --- | --- | --- |
| `id` | serial | Clave primaria |
| `source`, `source_id` | text | Origen (`idezar`) e `identifier` de IDEZAR; únicos en conjunto |
| `height_m` | double, not null | Altura usada para las sombras (ver ADR-001 en el `docs/DECISIONS.md` del workspace) |
| `height_source` | text | `measured`, `floors_estimate` o `default` |
| `height_suspicious` | boolean, por defecto `false` | Altura medida aceptada pero atípica, marcada para revisión |
| `floors` | smallint | `storeys_above_ground` (null si se desconoce o es 0) |
| `geom` | `geometry(MultiPolygon, 4326)` | Huella del edificio (índice GIST) |
| `import_run_id` | integer | Última ejecución de import que escribió la fila |

### Tabla `users`

| Columna | Tipo | Descripción |
| --- | --- | --- |
| `id` | serial | Clave primaria |
| `name` | varchar(100), not null | Nombre que se muestra en la aplicación |
| `email` | varchar(254), not null | Guardado en minúsculas; único sin distinguir mayúsculas (índice `users_email_lower_idx`) |
| `password_hash` | varchar(100) | Hash bcrypt de la contraseña (nunca la contraseña); null en cuentas creadas solo con Google |
| `google_id` | varchar(255), único | Identificador de la cuenta de Google vinculada; null si no se ha usado Google |
| `created_at`, `updated_at` | timestamptz | Fechas de alta y última modificación |

La restricción `users_credentials_check` obliga a que cada usuario tenga contraseña, cuenta de
Google o ambas.

## Imports de datos urbanos (PBI-3.1)

Se ejecutan después de las migraciones, en este orden:

```bash
npm run import:all            # edificios, árboles y red peatonal (unos 20 minutos)
# o uno a uno:
npm run import:buildings      # IDEZAR citygml3d:building
npm run import:trees          # IDEZAR idezar_base:arboles_2022
npm run import:streets        # vías peatonales de OpenStreetMap vía Overpass, troceadas en tramos
```

Cada ejecución se guarda en `import_runs` con `source_count` (lo que anuncia la fuente),
`imported_count` y `rejected_count`. Cada registro rechazado se guarda con su motivo y sus datos
originales en `import_rejections`. Si importados + rechazados no coincide con el número de la
fuente, la ejecución queda en `mismatch` y el comando sale con código 1. Repetir un import
actualiza las filas existentes; nunca las duplica. Las fuentes, campos y licencias están en
[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md), y las decisiones tomadas (altura de los edificios,
filtro de la red, troceo) en DECISIONS.md (ADR-001 a ADR-008), en la carpeta docs del Drive del
equipo (fuera de este repositorio).

Cada import, al empezar, marca como `stale` la última asociación a tramos de los tipos que puede
cambiar y avisa en el log: después de importar hay que volver a ejecutar `npm run associate`
(ver la sección siguiente y el ADR-010).

### Atribución de los datos

Origen de los datos: Ayuntamiento de Zaragoza (IDEZAR), edificios: vigencia 2026-10-01;
arbolado: inventario 2022 (capa `arboles_2022`).

© OpenStreetMap contributors, ODbL.

## Asociación a tramos peatonales (PBI-3.2)

Después de los imports, `npm run associate` liga cada árbol y cada edificio a los tramos de
`street_segments` que tiene cerca. Todo se calcula en PostGIS (unos 3 minutos con los datos
reales):

```bash
npm run import:all            # 1. datos
npm run associate             # 2. árboles y edificios
npm run associate -- --type=trees       # o un solo tipo (--type=buildings)
```

1. **Tramo más cercano**, medido en metros (los edificios, desde su polígono). Si está a
   `ASSOC_MAX_NEAREST_M` (150 m) o menos, se guarda con `is_nearest = true`; si no, el elemento va a
   `unassociated_elements` con `reason = 'isolated'`, su tramo más cercano y la distancia
   (`no_segment` si no hay tramos, `invalid_geometry` si su geometría no es válida).
2. **Asociaciones por radio**: cada elemento asociado se liga además a todos los tramos que tiene
   a `R` metros o menos (`is_nearest = false`). Árboles: `R = ASSOC_TREE_RADIUS_M` (25 m).
   Edificios: `R = max(ASSOC_BUILDING_MIN_RADIUS_M (30 m), height_m × ASSOC_BUILDING_HEIGHT_FACTOR (1,5))`.

Cada tipo se recalcula desde cero en una transacción (repetir el comando da el mismo resultado) y
se guarda en `association_runs`. El comando imprime una tabla por tipo (total, asociados y %,
aislados, asociaciones por radio, tramos por elemento, media y p95 de la distancia, segundos) y
sale con código 1 si asociados + no asociados no coincide con el total, si algún elemento está en
las dos tablas (`mismatch`) o si un tipo queda por debajo de `ASSOC_MIN_PCT` (95 %,
`below_threshold`). Si la última ejecución de un tipo está en `stale`, un import posterior ha
podido cambiar los datos y hay que volver a ejecutar el comando. Los criterios y la medición que
los justifica: ver DECISIONS.md (PBI-3.2, ADR-009 y ADR-010) en la carpeta docs del Drive del
equipo.

| Tabla | Contenido |
| --- | --- |
| `segment_trees` | `segment_id`, `tree_id`, `distance_m`, `is_nearest`; PK `(segment_id, tree_id)`, un solo `is_nearest` por árbol |
| `segment_buildings` | lo mismo con `building_id` |
| `unassociated_elements` | `element_type` (`tree` / `building`), `element_id`, `nearest_segment_id`, `nearest_distance_m`, `reason`, `association_run_id` |
| `association_runs` | una fila por tipo y ejecución: `params`, `total`, `nearest_ok`, `isolated`, `no_segment`, `invalid_geometry`, `radius_links`, `pct_associated`, `avg_segments_per_element`, `status`, `details` |

Las claves foráneas a `street_segments`, `trees` y `buildings` son `ON DELETE CASCADE`: si un
import borra un elemento o un tramo, sus asociaciones desaparecen con él.

Como acceso general a PBI-3.2, `src/services/geo/associationService.js` ofrece
`getTreesBySegment(segmentId)`, `getBuildingsBySegment(segmentId)` y
`getNearestSegmentForElement(type, id)`, con `distance_m`, `is_nearest` y los atributos urbanos
(`height_m`, `height_source`, `crown_diameter_m`). PBI-5.2 no limita las sombras a estos enlaces:
su radio fijo puede quedarse corto con el Sol bajo, por lo que hace una preselección dinámica
según la longitud solar efectiva. Todavía no hay endpoints de datos urbanos (PBI-3.3).

## Posición solar y sombras sobre tramos (PBI-5.1 y PBI-5.2)

`src/domain/solar/solarPosition.js` calcula acimut (grados desde el norte, sentido horario) y
elevación aparente con SunCalc. Recibe fecha y hora civil, coordenadas y, opcionalmente, una zona
IANA; usa `Europe/Madrid` por defecto. Luxon convierte esa hora a UTC y rechaza horas inexistentes
o ambiguas durante los cambios de horario de verano.

`src/services/shadow/shadowService.js` expone `calculateSegmentShadows(...)` para los servicios de
routing que se implementen después. Recibe los mismos datos solares y una lista no vacía de IDs de
`street_segments`. No se ha añadido un endpoint ni se persisten resultados: una sombra solo es
válida para el instante solicitado.

La consulta PostGIS de `src/repositories/shadowRepository.js`:

1. transforma tramos y elementos urbanos a EPSG:25830 para trabajar en metros;
2. desplaza cada huella en dirección opuesta al acimut una distancia
   `altura / tan(elevación)`;
3. modela cada edificio con la envolvente convexa de la huella y su copia desplazada;
4. modela la copa de cada árbol como un círculo de 16 segmentos y proyecta la cápsula resultante;
5. intersecta los polígonos con las líneas completas de los tramos y une solapes antes de calcular
   `shadedLengthM` y `shadeRatio`.

La envolvente convexa es exacta para huellas convexas y conservadora para edificios cóncavos o
multipartes: puede sobreestimar la sombra en sus entrantes. No se modelan relieve, fachadas,
transparencia de copas ni oclusión entre objetos. Con elevación menor o igual a cero el servicio
devuelve `sun_below_horizon` y no proyecta geometrías.

Los edificios usan `height_m` y conservan `height_source` y `height_suspicious` en cada asociación.
Un árbol solo participa si tiene `height_m` y `crown_diameter_m` positivos; nunca se rellenan esos
campos. `dataQuality` devuelve los totales utilizables y los omitidos por altura, copa o geometría.
La respuesta conserva tanto `segmentId`/`segmentSourceId` como `elementId`/`sourceId`.

## Desarrollo

```bash
npm run dev
```

La API se sirve en <http://localhost:3000/api>. Para registrarse e iniciar sesión hacen falta la
base de datos arrancada con las migraciones aplicadas y `JWT_SECRET` en el `.env` (ver
[Autenticación](#autenticación-pbi-4)).

## Tests

```bash
npm test                      # tests unitarios y HTTP, sin base de datos
npm run test:integration      # tests con PostGIS; necesitan `docker compose up -d db`
npm run test:all              # ambos, con cobertura combinada
```

Los tests nunca llaman a APIs externas; las respuestas de IDEZAR y Overpass salen de fixtures en
`src/tests/fixtures`.

### Cobertura conjunta con PostGIS

La verificación local del 2026-10-20, ejecutada con PostgreSQL/PostGIS mediante
`npm run test:all -- --runInBand`, completó 25 suites y 262 tests sin fallos. La cobertura
combinada de tests unitarios, HTTP e integración fue:

| Métrica | Cobertura |
| --- | ---: |
| Sentencias | 97,91 % |
| Ramas | 91,15 % |
| Funciones | 97,48 % |
| Líneas | 98,60 % |

Estas cifras incluyen `src/tests/integration/shadows.test.js`, que ejecuta la proyección y la
asociación de sombras de PBI-5.2 contra PostGIS. Pueden variar al añadir código o pruebas; el
resultado vigente debe comprobarse volviendo a ejecutar el comando.

## Comprobaciones

```bash
npm run check
npm run lint                  # ESLint (airbnb-base + compatibilidad con Prettier)
npm run format:check          # Prettier
```

Para ejecutar localmente las mismas comprobaciones que GitHub Actions:

```bash
npm run ci
```

Este comando ejecuta ESLint, comprueba el formato con Prettier, valida la sintaxis y lanza los
tests unitarios y HTTP. El workflow se ejecuta en cada pull request hacia `main`. Las llamadas a
OpenRouteService están simuladas en los tests, por lo que CI no necesita `ORS_API_KEY`.

## Arranque en producción

```bash
npm start
```

## Despliegue en producción (Azure)

Producción corre en una máquina virtual de Azure con Docker Compose: Caddy (HTTPS), frontend, backend y PostGIS.
Cada push a `main` ejecuta el workflow `Deploy`, que pasa `npm run ci`, publica la imagen en GHCR
y la despliega por SSH aplicando antes las migraciones. La configuración del servidor y los pasos
para crearlo están en [deploy/README.md](deploy/README.md).

## Variables de entorno

- `NODE_ENV`: entorno de ejecución.
- `PORT`: puerto HTTP. Valor local por defecto: `3000`.
- `CORS_ORIGIN`: origen permitido del frontend. Valor local por defecto: `http://localhost:5173`.
- `LOG_LEVEL`: `debug`, `info` (por defecto), `warn`, `error` o `silent` (por defecto en los tests).
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`: conexión a PostgreSQL/PostGIS; también
  las usa `docker-compose.yml`. `DB_TEST_NAME`: nombre de la base de datos de test.
- `DATABASE_URL`, `TEST_DATABASE_URL`: cadenas de conexión opcionales que sustituyen a los valores `DB_*`.
- `IDEZAR_WFS_URL`, `OVERPASS_URL`: endpoints de las fuentes del import (valores por defecto en `src/config/importConfig.js`).
- `IMPORT_WFS_PAGE_SIZE` (2000), `IMPORT_BATCH_SIZE` (500): tamaño de página del import y de cada transacción.
- `BUILDING_FLOOR_HEIGHT_M` (3), `BUILDING_GROUND_FLOOR_EXTRA_M` (1), `BUILDING_DEFAULT_HEIGHT_M` (4),
  `BUILDING_MIN_HEIGHT_M` (2), `BUILDING_MAX_HEIGHT_M` (150), `BUILDING_MIN_HEIGHT_PER_FLOOR_M` (2),
  `BUILDING_MAX_HEIGHT_PER_FLOOR_M` (8), `BUILDING_MAX_SINGLE_STOREY_HEIGHT_M` (40),
  `BUILDING_SUSPICIOUS_SINGLE_STOREY_HEIGHT_M` (15), `BUILDING_SUSPICIOUS_HEIGHT_PER_FLOOR_M` (6):
  estimación de la altura de los edificios (ver ADR-001 en el `docs/DECISIONS.md` del workspace).
- `ASSOC_MAX_NEAREST_M` (150), `ASSOC_KNN_CANDIDATES` (10), `ASSOC_TREE_RADIUS_M` (25),
  `ASSOC_BUILDING_MIN_RADIUS_M` (30), `ASSOC_BUILDING_HEIGHT_FACTOR` (1.5), `ASSOC_MIN_PCT` (95),
  `ASSOC_BATCH_SIZE` (20000): asociación a tramos peatonales (`src/config/associationConfig.js`;
  ver ADR-009 en el `docs/DECISIONS.md` del workspace).
- `ORS_API_KEY`: clave de API de OpenRouteService / HeiGIT que usan el autocompletado y el cálculo
  de rutas. Guárdala solo en el `backend/.env` ignorado por Git o en el entorno del servidor.
  `OPENROUTESERVICE_API_KEY` sigue funcionando como alternativa para configuraciones antiguas.
- `OPENROUTESERVICE_GEOCODING_BASE_URL`: URL base de la API de geocodificación. Valor local por defecto: `https://api.heigit.org/pelias/v1`.
- `OPENROUTESERVICE_DIRECTIONS_BASE_URL`: URL base de la API de rutas. Valor local por defecto:
  `https://api.openrouteservice.org/v2/directions`.
- `JWT_SECRET` (**obligatoria y secreta**): clave con la que se firman los tokens de sesión. Debe
  ser larga y aleatoria; se puede generar con
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Sin ella, el
  registro y el inicio de sesión devuelven `503`. Usa una distinta en cada entorno.
- `JWT_EXPIRES_IN`: duración de la sesión en el formato de `jsonwebtoken` (`7d`, `12h`...). Por
  defecto `7d`.
- `FRONTEND_URL`: URL del frontend a la que vuelve el usuario tras el login con Google. Por defecto
  `http://localhost:5173`.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (**secreta**): credenciales del cliente OAuth de
  Google. Son opcionales: sin ellas solo funciona el acceso con email y contraseña, y el botón de
  Google vuelve al login con un aviso.
- `GOOGLE_CALLBACK_URL`: dirección a la que Google devuelve al usuario. Por defecto
  `http://localhost:5173/api/auth/google/callback` (pasa por el proxy de Vite). Debe coincidir
  exactamente con un "URI de redirección autorizado" del cliente OAuth.

## Autenticación (PBI-4)

Los usuarios se registran con nombre, email y contraseña, o con su cuenta de Google. Al
registrarse o iniciar sesión, la API devuelve un token JWT que el frontend guarda y envía en cada
petición con la cabecera `Authorization: Bearer <token>`. El token caduca según `JWT_EXPIRES_IN`;
cerrar sesión consiste en que el frontend lo borre, así que no hay endpoint de logout.

Las contraseñas se guardan con bcrypt (coste 10) y deben tener entre 8 caracteres y 72 bytes. El
objeto `user` de las respuestas es siempre `{ id, name, email }` y nunca incluye el hash.

### Endpoints protegidos

`/api/routes/*` y `/api/geocoding/*` exigen un token válido. Sin cabecera, o con un token
caducado o manipulado, responden:

```json
{ "error": { "message": "Necesitas iniciar sesión." } }
```

con código `401`. `/api/health` sigue siendo público.

### Errores de validación

Los `400` de autenticación incluyen `fields`, con un mensaje por cada campo incorrecto, para que
el frontend lo muestre junto a ese campo:

```json
{
  "error": {
    "message": "Revisa los datos marcados.",
    "fields": {
      "email": "Introduce un correo electrónico válido.",
      "password": "La contraseña debe tener al menos 8 caracteres."
    }
  }
}
```

### `POST /api/auth/register`

Crea una cuenta con email y contraseña. Cuerpo: `name` (1-100 caracteres), `email` y `password`.

```bash
curl --request POST http://localhost:3000/api/auth/register \
  --header "Content-Type: application/json" \
  --data '{ "name": "Ana López", "email": "ana@correo.es", "password": "segura123" }'
```

Respuesta `201 Created`:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": 1, "name": "Ana López", "email": "ana@correo.es" }
}
```

| Código | Significado |
| --- | --- |
| `400` | Algún campo falta o no es válido (con `fields`). |
| `409` | Ya existe una cuenta con ese email (`fields.email`). |
| `503` | Falta `JWT_SECRET` en el servidor. |
| `500` | Error interno inesperado. |

### `POST /api/auth/login`

Inicia sesión con email y contraseña. Cuerpo: `email` y `password`.

```bash
curl --request POST http://localhost:3000/api/auth/login \
  --header "Content-Type: application/json" \
  --data '{ "email": "ana@correo.es", "password": "segura123" }'
```

Respuesta `200 OK`: el mismo formato que el registro (`{ token, user }`).

| Código | Significado |
| --- | --- |
| `400` | Falta el email o la contraseña (con `fields`). |
| `401` | `El correo o la contraseña no son correctos.` Es el mismo mensaje para un email que no existe, una contraseña incorrecta o una cuenta creada solo con Google, para no revelar qué emails están registrados. |
| `503` | Falta `JWT_SECRET` en el servidor. |

### `GET /api/auth/me`

Devuelve el usuario de la sesión. El frontend lo usa al arrancar para comprobar que el token
guardado sigue siendo válido.

```bash
curl http://localhost:3000/api/auth/me --header "Authorization: Bearer <token>"
```

Respuesta `200 OK`:

```json
{ "user": { "id": 1, "name": "Ana López", "email": "ana@correo.es" } }
```

Devuelve `401` si el token falta, no es válido, ha caducado o el usuario ya no existe.

### `GET /api/auth/google` y `GET /api/auth/google/callback`

No se llaman con `fetch`: el navegador navega a ellos.

1. `GET /api/auth/google` redirige (`302`) a la pantalla de Google para elegir la cuenta.
2. Google vuelve a `GOOGLE_CALLBACK_URL` (`/api/auth/google/callback`) con un código que el
   backend canjea por el id, el email y el nombre del usuario.
3. El backend redirige al frontend:
   - si todo va bien, a `FRONTEND_URL/#authToken=<token>`. El token va en el fragmento (`#`), que
     el navegador nunca envía a ningún servidor, y el frontend lo borra de la barra de direcciones
     al leerlo;
   - si Google no está configurado, el usuario cancela o la cuenta no es válida, a
     `FRONTEND_URL/#authError=google`.

Para resolver la cuenta, el backend busca primero un usuario vinculado a ese id de Google. Si no
existe, busca uno con el mismo email y lo vincula, solo si Google indica que el email está
verificado. Si tampoco existe, crea una cuenta nueva sin contraseña.

### Configurar el login con Google

1. En <https://console.cloud.google.com>, crea un proyecto.
2. En **Google Auth Platform** (o "Pantalla de consentimiento de OAuth"), configura la app con
   público **Externo** y añade en **Usuarios de prueba** las cuentas que vayan a entrar. Mientras
   la app esté en modo "Prueba", Google bloquea cualquier otra cuenta.
3. En **Clientes**, crea un **ID de cliente de OAuth** de tipo **Aplicación web** con:
   - origen de JavaScript autorizado: `http://localhost:5173`;
   - URI de redirección autorizado: `http://localhost:5173/api/auth/google/callback`.
4. Copia el ID y el secreto del cliente en `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` del `.env`
   (nunca en `.env.example`) y reinicia el backend.

En producción hay que añadir en el cliente OAuth el origen y la URI de callback del dominio real, y
poner esa URI en `GOOGLE_CALLBACK_URL` y el dominio en `FRONTEND_URL`.

## Contrato del autocompletado (PBI-1)

`GET /api/geocoding/autocomplete?text=Plaza%20del%20Pilar&limit=5`

Necesita la cabecera `Authorization: Bearer <token>` (ver [Autenticación](#autenticación-pbi-4)).

Devuelve `{ results: [{ id, label, lat, lng, source: "search" }] }`.
Un texto de menos de 3 caracteres devuelve una lista vacía; la longitud máxima es 200.
`limit` vale 5 por defecto y debe ser un entero de 1 a 10. Las consultas no válidas devuelven 400.
El adaptador valida, normaliza y elimina duplicados de los resultados del proveedor.
La búsqueda se centra en Zaragoza y filtra por España. No se limita al término municipal.

Los errores usan `{ error: { message } }`: 401 sin sesión, 503 si falta configuración, 429 si se agota la cuota
del proveedor, 504 si el proveedor supera el timeout de 8 segundos y 502 si falla el proveedor o
la red, o la respuesta no es válida. Nunca se reenvían cuerpos de respuesta del proveedor ni
credenciales. Los tests automáticos simulan las peticiones externas.

Desde la raíz del workspace, `docker compose up` carga `backend/.env` mediante `env_file`.
Crea ese fichero (ignorado por Git) a partir de `.env.example` antes de arrancar Compose; no
sobrescribas una clave existente. El frontend llega a la API a través del proxy de desarrollo de
Vite.

## Contrato de la ruta rápida (PBI-2)

`POST /api/routes/fastest`

Calcula la ruta peatonal más rápida entre dos coordenadas, sin considerar sombra, sol, viento ni
otros factores de confort. Necesita la cabecera `Authorization: Bearer <token>` (ver
[Autenticación](#autenticación-pbi-4)).

### Petición

El cuerpo JSON debe incluir `origin` y `destination`. Cada punto debe contener una latitud entre
`-90` y `90` y una longitud entre `-180` y `180`:

```json
{
  "origin": { "lat": 41.6488, "lng": -0.8891 },
  "destination": { "lat": 41.656, "lng": -0.878 }
}
```

Ejemplo:

```bash
curl --request POST http://localhost:3000/api/routes/fastest \
  --header "Content-Type: application/json" \
  --header "Authorization: Bearer <token>" \
  --data '{
    "origin": { "lat": 41.6488, "lng": -0.8891 },
    "destination": { "lat": 41.656, "lng": -0.878 }
  }'
```

### Respuesta correcta

Devuelve `200 OK` con una geometría GeoJSON `LineString`, la distancia total en metros y la
duración estimada en segundos:

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

### Errores

Todos los errores usan `{ "error": { "message": "..." } }`:

| Código | Significado |
| --- | --- |
| `400` | Faltan coordenadas, no son numéricas o están fuera de rango. |
| `401` | No hay sesión o el token no es válido. |
| `429` | Se ha agotado la cuota de OpenRouteService. |
| `502` | El proveedor no está disponible o ha devuelto una respuesta inválida. |
| `503` | El servidor no tiene configurada la clave de OpenRouteService. |
| `504` | OpenRouteService no ha respondido antes del timeout de 8 segundos. |
| `500` | Error interno inesperado. |

Las respuestas nunca incluyen credenciales, cuerpos del proveedor ni detalles internos. Los
tests automáticos simulan OpenRouteService y no consumen cuota.

## Exposición por tramo (PBI-5.3)

`src/services/shadow/exposureService.js` reutiliza PBI-5.2 para obtener, en una sola consulta por
lote, `shadePercentage` y `sunPercentage` de cada ID de `street_segments`. Los resultados incluyen
el instante UTC y la hora civil de referencia. Un cero calculado se devuelve como `available`; un
tramo inexistente, inválido, de longitud cero o calculado con el Sol bajo el horizonte se devuelve
como `unavailable` con una razón y porcentajes `null`. No hay endpoint ni persistencia propios.

## Contrato de la Ruta Sombreada (PBI-5.4)

`POST /api/routes/shaded` requiere sesión. Recibe origen, destino, fecha y hora civil; la zona IANA
es opcional y por defecto es `Europe/Madrid`:

```json
{
  "origin": { "lat": 41.6488, "lng": -0.8891 },
  "destination": { "lat": 41.656, "lng": -0.878 },
  "date": "2026-06-21",
  "time": "14:00",
  "timeZone": "Europe/Madrid"
}
```

La respuesta contiene siempre la candidata rápida con su estado de exposición. `shaded` solo
contiene una geometría diferente si una alternativa tiene cobertura suficiente, mejora al menos
5 puntos de sombra, no supera un 25 % de duración adicional y vence según el coste de ADR-014.
En caso contrario vale `null`:

```json
{
  "comparison": {
    "status": "selected",
    "fastest": {
      "geometry": { "type": "LineString", "coordinates": [[-0.8891, 41.6488], [-0.878, 41.656]] },
      "distance": 1250,
      "duration": 900,
      "exposure": { "status": "available", "shadePercentage": 22, "sunPercentage": 78 }
    },
    "shaded": {
      "geometry": { "type": "LineString", "coordinates": [[-0.8891, 41.6488], [-0.88, 41.652], [-0.878, 41.656]] },
      "distance": 1370,
      "duration": 990,
      "exposure": { "status": "available", "shadePercentage": 68, "sunPercentage": 32 }
    },
    "additionalDurationSeconds": 90,
    "shadeImprovementPercentagePoints": 46
  }
}
```

Estados posibles: `selected`, `no_better_alternative`, `insufficient_exposure_data` y
`sun_below_horizon`. Los errores de autenticación, validación y proveedor usan el mismo formato y
códigos controlados que `/api/routes/fastest`. El endpoint necesita los datos urbanos ya cargados,
pero no añade migraciones, variables ni dependencias.

## Checklist de verificación manual

### PBI-5.3 y PBI-5.4 - Exposición y Ruta Sombreada

- [ ] `npm run ci` valida porcentajes, ponderación por longitud, coste, alternativas, API y
      regresión de la ruta rápida.
- [ ] Con PostGIS, `npm run test:integration -- --runInBand
      src/tests/integration/routeSegments.test.js src/tests/integration/shadows.test.js` valida la
      asociación de corredores, el rechazo de cruces y la unión de sombras solapadas.
- [ ] Con datos urbanos, sesión y ORS configurado, `POST /api/routes/shaded` devuelve una
      alternativa real o `shaded: null` con estado explícito; nunca duplica la rápida con otro color.
- [ ] No hay migraciones, persistencia, dependencias ni variables nuevas.

### PBI-5.1 y PBI-5.2 - Posición solar y sombras

- [ ] `npm test -- --runInBand` valida la referencia NOAA de Zaragoza, horario de verano,
      entradas inválidas, dirección y longitud de los vectores y Sol bajo el horizonte.
- [ ] Con PostGIS arrancado, `npm run test:integration -- --runInBand
      src/tests/integration/shadows.test.js` proyecta un edificio y un árbol sintéticos hacia el
      oeste, comprueba que no sombrean el tramo este y verifica longitudes de 4 m.
- [ ] La misma prueba confirma que árboles sin altura o sin diámetro de copa se contabilizan como
      incompletos y no producen sombras inventadas.
- [ ] `npm run ci` termina correctamente. No hay migraciones, variables de entorno ni endpoints
      nuevos para estas PBIs.

### PBI-3.2 - Asociación de edificios y arbolado a tramos peatonales

Valores reales del 2026-10-19, sobre los datos de la PBI-3.1.

- [ ] Con los datos de la PBI-3.1 cargados, `npm run db:migrate` solo aplica
      `20261019000001-create-associations` (`SELECT name FROM sequelize_meta;` → 6 migraciones,
      contando `20261009000001-create-users` de la PBI-4).
- [ ] `npm run associate` termina con `success` en `tree` y `building`, en unos 3 minutos, y con
      código de salida 0.
- [ ] `SELECT element_type, status, total, nearest_ok, isolated, radius_links, pct_associated FROM association_runs ORDER BY id DESC LIMIT 2;`
      → `tree`: 172.543 / 172.543 / 0 / 1.008.612 / 100,000; `building`: 38.963 / 38.690 /
      273 / 428.619 / 99,299.
- [ ] Cuadre:
      `SELECT (SELECT count(*) FROM buildings), (SELECT count(*) FROM segment_buildings WHERE is_nearest), (SELECT count(*) FROM unassociated_elements WHERE element_type = 'building');`
      → 38.963 = 38.690 + 273 (con `trees`, `segment_trees` y `'tree'`: 172.543 = 172.543 + 0).
- [ ] Ningún elemento en las dos tablas:
      `SELECT count(*) FROM unassociated_elements u JOIN segment_buildings sb ON sb.building_id = u.element_id WHERE u.element_type = 'building';` → 0.
- [ ] Aislados más lejanos:
      `SELECT element_id, round(nearest_distance_m) FROM unassociated_elements ORDER BY nearest_distance_m DESC LIMIT 5;`
      → 23461 (588), 2974 (461), 2971 (453), 23379 (442), 22830 (429): edificios de campo o de la
      periferia.
- [ ] El radio de los edificios depende de la altura:
      `SELECT count(*) FROM segment_buildings sb JOIN buildings b ON b.id = sb.building_id WHERE NOT sb.is_nearest AND sb.distance_m > GREATEST(30, b.height_m * 1.5);` → 0.
- [ ] `npm run associate -- --type=trees` otra vez: `SELECT count(*) FROM segment_trees;` sigue en
      1.181.155.
- [ ] Tras cualquier `npm run import:*`, el log avisa de que hay que ejecutar `npm run associate`
      y `SELECT element_type, status FROM association_runs ORDER BY id DESC LIMIT 2;` muestra `stale`
      en el tipo afectado.

### PBI-4 - Registro e inicio de sesión

- [ ] `npm run db:migrate` aplica `20261009000001-create-users` y `\d users` (en
      `docker compose exec db psql -U weathermapz -d weathermapz`) muestra la tabla.
- [ ] Sin `JWT_SECRET` en el `.env`, `POST /api/auth/register` devuelve `503`; con él, `201`.
- [ ] Registrarse dos veces con el mismo email, aunque cambien las mayúsculas, devuelve `409`.
- [ ] La contraseña no se guarda en texto plano:
      `SELECT email, left(password_hash, 7) FROM users;` → empieza por `$2b$10$`.
- [ ] Login con contraseña incorrecta o email inexistente → `401` con el mismo mensaje.
- [ ] `GET /api/auth/me` con el token del login → `200` con `{ user }`; sin token → `401`.
- [ ] `POST /api/routes/fastest` y `GET /api/geocoding/autocomplete` sin token → `401`; con
      token → funcionan como antes.
- [ ] Sin `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `GET /api/auth/google` redirige a
      `FRONTEND_URL/#authError=google`.
- [ ] Con Google configurado, el login con una cuenta de prueba vuelve al frontend con sesión y
      crea la fila en `users` con `google_id` (o lo añade a la cuenta con el mismo email).
- [ ] Cancelar en la pantalla de Google vuelve al login del frontend con un aviso.

### PBI-3.1 - Importación de edificios y arbolado

- [ ] `docker compose up -d db` y `npm run db:migrate` terminan sin errores y aplican las cuatro
      migraciones de la PBI-3.1 (`SELECT name FROM sequelize_meta;`; seis desde la PBI-3.2). En
      una base de datos que ya tenía las tres primeras, `npm run db:migrate` solo añade
      `20261006000004-add-building-height-suspicious`.
- [ ] `npm run import:all` termina con `SUCCESS` en `buildings`, `trees` y `streets`, y con código
      de salida 0.
- [ ] Los conteos coinciden con la fuente:
      `SELECT dataset, source_count, imported_count, rejected_count, status FROM import_runs ORDER BY id DESC LIMIT 3;`
      Compara `source_count` con el `numberMatched` de
      `https://idezar-sig.zaragoza.es/servicios/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=citygml3d:building&resultType=hits`
      (y de `idezar_base:arboles_2022`).
- [ ] `SELECT count(*) FROM buildings;`, `trees` y `street_segments` coinciden con `imported_count`.
- [ ] Los rechazos son visibles: `SELECT dataset, reason, count(*) FROM import_rejections GROUP BY 1, 2;`
- [ ] Volver a ejecutar `npm run import:trees` no cambia `SELECT count(*) FROM trees;`.
- [ ] `SELECT height_source, count(*) FROM buildings GROUP BY 1;` → measured ≈ 38.712,
      floors_estimate ≈ 248, default ≈ 3 (valores del 2026-10-06; cambian un poco si se actualiza
      la fuente).
- [ ] `SELECT count(*) FROM buildings WHERE height_suspicious;` → ≈ 727.
- [ ] Un edificio de una planta con 12 m medidos conserva sus 12 m:
      `SELECT height_m, height_source, height_suspicious FROM buildings WHERE source_id = 'ES.SDGC.BU.1250607XM8015A07';`
      → `12 | measured | f`.
- [ ] Las alturas de una planta no se recortan:
      `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY height_m), percentile_cont(0.9) WITHIN GROUP (ORDER BY height_m) FROM buildings WHERE floors = 1;`
      → 4.6 y 7.8.
