# Project Guidelines & Rules: A Little Coffee (`coffee-cupping-server`)

## 1. Zero External Runtime Dependencies (Node.js 22 Native)
- The server is strictly built on native Node.js 22 built-in modules (`node:http`, `node:sqlite`, `node:crypto`, `node:fs`, `node:path`).
- Do NOT introduce third-party runtime npm packages (e.g., Express, Better-SQLite3, Axios, Lodash). Keep runtime zero-dependency.
- The frontend is built on vanilla web standards (HTML5, CSS3, ES2022 JavaScript) without framework bundles.

## 2. English-Only Repository Content
- All source code comments (`server/*.js`, `public/*.js`, `cupping_standalone.html`), `README.md`, `Dockerfile`, `docker-compose.yml`, `.env.example`, and Git commit messages MUST be written in English.
- Only user-facing localization dictionaries (`ja` default, `zh`, `en` in `public/i18n.js`) contain localized UI strings.

## 3. Docker Compose & Environment Preservation
- Never hardcode sensitive secrets or passwords into source code or `docker-compose.yml`. Keep `.env` bindings with safe defaults (`${VAR:-default}`).
- Keep `DOCKER_API_VERSION=${DOCKER_API_VERSION:-1.44}` in `docker-compose.yml` for Docker Engine v25+ compatibility.

## 4. Branching, PRs & Release Workflow
- Collaborators must develop on feature branches (`feature/xxx`) and submit Pull Requests to `main`.
- Feature branches must NOT bump `package.json` version or create Git release tags.
- Version bumping (e.g., `1.0.5` -> `1.0.6`) and annotated Git tagging (`git tag -a v1.0.x`) are reserved for production releases on `main`.

## 5. GitHub Actions Workflow Constraints
- Do not reference the `secrets` context directly inside step-level `if:` conditions (`if: ${{ secrets.X != '' }}`). Map secrets into step `env:` variables and check them inside `run:` shell scripts.
