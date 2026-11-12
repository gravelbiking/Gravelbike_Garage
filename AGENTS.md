# Development and release agreement

- Application source is in `src/` and `selfhost/`. This repository contains an explicitly approved, sanitized source snapshot; keep runtime data, credentials, keys, uploads and logs out of Git.
- Use the PHP/MariaDB Codespace configured in `.devcontainer/`. Run `npm test` and validate relevant UI changes in the preview on private port 4173.
- `npm run dev` starts a development preview with its own database. It does not connect to production.
- The installable Uberspace ZIP is a separate, approved release asset. Do not deploy, publish releases or change a server without the user's explicit request.
- Preserve previous release assets and avoid committing `.local/`, environment files or personal data.
