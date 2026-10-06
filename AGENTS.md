# WeatherMapZ Backend - Instrucciones para Codex

Este repositorio contiene el backend de WeatherMapZ.

Antes de hacer cambios importantes, lee la documentación global de WeatherMapZ,
sobre todo:

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

## Responsabilidades

El backend se encarga de:

- API REST
- cálculo de rutas
- cálculos de confort
- procesamiento geográfico
- acceso a la base de datos
- integración meteorológica
- cálculos de sol/sombra
- exposición al viento
- integraciones con APIs externas

## Arquitectura

Mantén una separación clara entre:

HTTP/API
    ↓
Aplicación/servicios
    ↓
Dominio/lógica de negocio
    ↓
Repositorios/integraciones
    ↓
PostgreSQL/PostGIS / APIs externas

No pongas lógica de negocio compleja dentro de los controladores de Express.

## GIS

Usa PostgreSQL/PostGIS para las operaciones espaciales que corresponda.

Evita el procesamiento geográfico ineficiente en JavaScript cuando PostGIS
ofrezca una operación adecuada.

## Integraciones externas

Mantén los proveedores externos aislados detrás de servicios/adaptadores.

Integraciones posibles:

- OpenRouteService
- Open-Meteo
- IDEZAR
- OpenStreetMap

La lógica de negocio principal no debe depender directamente de los
formatos de respuesta de cada proveedor cuando se pueda evitar.

## Cálculo de rutas

El modelo de rutas debe equilibrar el tiempo de viaje y el confort climático.

Factores posibles:

- tiempo
- distancia
- sombra
- sol
- temperatura
- viento
- vegetación

La función de coste final y sus pesos NO están definidos.

No te los inventes.

## Datos sin resolver

Nunca supongas el significado de `Alturas_Edificios.etiqueta`.

Nunca supongas que los cálculos de sombras de Zaragoza son accesibles públicamente.

Consulta `docs/DECISIONS.md` antes de implementar funcionalidad que dependa de
una cuestión sin resolver.

## Testing

La lógica de rutas y de dominio debe poder probarse sin Express ni APIs
externas.

Usa Jest y Supertest donde corresponda.

Cobertura automática mínima: 50 %.
Objetivo: 75 %.

## Configuración

Nunca escribas directamente en el código:

- credenciales
- claves de API
- contraseñas de bases de datos
- configuración específica de un entorno

Usa variables de entorno y mantén `.env.example`.

## Documentación obligatoria por PBI

- Al terminar cada PBI, y antes de abrir su pull request, añade su entrada al principio del
  "Registro de PBIs" del `docs/DECISIONS.md` del workspace (documentación global, fuera de este
  repositorio), con: título, fecha, rama y estado (En revisión / Fusionada #N); qué se ha hecho,
  en lenguaje claro; las condiciones de satisfacción marcadas, con dónde se comprueba cada una
  (test, comando o query); los datos y resultados reales; los cambios técnicos (tablas,
  migraciones, comandos npm, variables de entorno, endpoints); enlaces a los ADR tomados; lo
  pendiente y los riesgos para siguientes PBIs; y cómo verificarlo a mano.
- Registra cada decisión técnica no obvia como un ADR nuevo en el mismo fichero. Si una decisión
  cambia, añade un ADR nuevo y marca el anterior como "Sustituido por ADR-00X". Nunca borres el
  histórico.
- Actualiza TODOS los ficheros Markdown afectados por el cambio: `DATA_SOURCES.md` si cambian
  fuentes o datos, `README.md` si cambian el arranque, las variables de entorno, los comandos, el
  esquema o la checklist manual, y la documentación de la API si cambian endpoints.
- Antes de cerrar la PBI, haz un grep en todos los ficheros Markdown de los términos y cifras que
  hayan cambiado, para no dejar información desactualizada en ninguno.
- La descripción del pull request va en `PR-<pbi>.md` (solo en local, ignorado por Git) y es un
  resumen breve que enlaza a la entrada de la PBI en el `docs/DECISIONS.md` del workspace.
