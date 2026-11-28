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

## Trusted HTTPS without a domain

Caddy 2.11+ supports Let's Encrypt certificates for the Droplet's public IPv4
address using the `shortlived` ACME profile. These certificates last 160 hours;
Caddy renews them automatically and keeps their state in its existing data volume.
No DNS registration or paid service is required.

1. Deploy the current frontend configuration using **Deploy to DigitalOcean**.
2. Run **Configure DigitalOcean HTTPS** from `main` with `mode=inspect` to verify
   the existing stack and Caddy version.
3. Run the same workflow with `mode=enable`. It sets `PUBLIC_ORIGIN` to
   `https://<DO_HOST>`, updates the edge's `SITE_ADDRESS` and `TLS_SERVER_NAME`,
   then recreates only API and Caddy with the existing image digests.
4. The workflow verifies the trusted certificate, public API and HTTP-to-HTTPS
   redirect. A failed certificate or external check restores the previous settings.

The operation uses the existing verified SSH key, protected `production`
environment and server-side deployment lock. Private environment backups remain
on the Droplet under `production/https-backups/<run>-<attempt>` with restricted
permissions; credentials, database volumes and certificate storage are preserved.

After switching from HTTP to HTTPS, readers sign in again because browser storage
belongs to the new origin. Frontend API requests continue to use `location.origin`.
