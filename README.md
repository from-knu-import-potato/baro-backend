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
