# baro-backend

BARO Backend

## Local configuration

The `local` profile imports `./config/application-secret.yaml` when it exists.
Copy `config/application-secret.example.yaml` to `config/application-secret.yaml`
and set environment variables such as `OPENAI_API_KEY` and `KAKAO_REST_API_KEY`.

OpenAI auto-configuration is disabled by default so the server can start without
an OpenAI key. Enable only the required model type in the secret file, for
example:

```yaml
spring:
  ai:
    model:
      chat: openai
    openai:
      api-key: ${OPENAI_API_KEY}
```

## Docker deployment

Create the runtime environment files:

```bash
cp .env.example .env
cp config/application-secret.example.yaml config/application-secret.yaml
```

Set the values in `.env`, then build and run:

```bash
docker compose up -d --build
```

The API is exposed on `http://localhost:8080` by default. Change `APP_PORT` in
`.env` to bind another host port.

Useful commands:

```bash
docker compose logs -f baro-api
docker compose down
```

The container stores the default H2 database under `/app/data`, which is backed
by the `baro-data` Docker volume. For local Docker usage, `.env` is loaded by
Docker Compose and `config/application-secret.yaml` is available to the local
profile as an optional override.

## Render deployment

Use the `prod` Spring profile on Render. The local profile is the default only
for development.

Do not upload `.env` or `config/application-secret.yaml` to Render. Set Render
Dashboard environment variables instead.

Set these Render environment variables:

```text
SPRING_PROFILES_ACTIVE=prod
SPRING_DATASOURCE_URL=<production JDBC URL>
SPRING_DATASOURCE_USERNAME=<production DB user>
SPRING_DATASOURCE_PASSWORD=<production DB password>
KAKAO_REST_API_KEY=<Kakao REST API key>
# Alternatively, set KAKAO_CLIENT_ID instead of KAKAO_REST_API_KEY.
KAKAO_CLIENT_SECRET=<Kakao client secret, if used>
KAKAO_REDIRECT_URI=https://<render-service-domain>/api/v1/auth/kakao/callback
OPENAI_API_KEY=<OpenAI API key, if OpenAI is enabled>
JAVA_OPTS=-XX:MaxRAMPercentage=75.0 -XX:+UseContainerSupport
```

Render provides the `PORT` environment variable for web services. The `prod`
profile maps that value to `server.port`, so do not hard-code the server port
for Render.

Configure the Render health check path as:

```text
/actuator/health
```
