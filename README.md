# baro-backend

BARO Backend

## Local configuration

The application imports `./config/application-secret.yaml` when it exists.
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
by the `baro-data` Docker volume. The local `config/` directory is mounted into
the container as read-only so `config/application-secret.yaml` can be updated
without rebuilding the image.
