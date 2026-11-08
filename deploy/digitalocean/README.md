# DigitalOcean frontend deployment

The frontend runs on the existing `quiz-project-prod` Droplet using Compose.
Deploy the backend first: it creates the external `quizproject-<environment>`
network and the internal `quiz-api` endpoint. Caddy routes `/api/*` to that API,
serves nginx on the same origin and manages HTTPS once a domain is configured.

Follow the shared [server and GitHub setup guide](https://github.com/vitaliilatysh/quizproject/blob/master/docs/digitalocean-deployment.md).
Both repositories require the same environment variables and SSH secrets.
The backend's `prepare-env.py` creates both server-side `.env` files together.

The frontend workflow retains signed image digest verification, CI/Sonar/container
and E2E release gates, strict SSH host verification, health checks, and rollback
to the previous release. Runtime API configuration uses `location.origin`.
Automatic staging must be explicitly enabled; production dispatch is manual.
