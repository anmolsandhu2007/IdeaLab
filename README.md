# Idea Lab

A research workspace for startup ideas with NVIDIA-hosted Nemotron or Gemma models. Describe an idea, retrieve public evidence, and read a structured report with competitors, customer pain signals, opportunities, risks, and improvement suggestions. Supports local SQLite or persistent Turso storage and a shared-password production gate.

## Run locally

Requires Node.js 22.12+ (Node 24 recommended), pnpm, and an internet connection for live research. No local AI runtime or GPU is required.

```powershell
pnpm install
pnpm db:generate
pnpm dev
```

Open **http://127.0.0.1:3000**. Development binds to loopback. With `APP_ACCESS_PASSWORD` unset and `NODE_ENV` not production, local development does not require login. To test the gate locally, configure both `APP_ACCESS_PASSWORD` and `APP_SESSION_SECRET`.

Dependencies are already installed in this checkout. On Windows, if a native SQLite dependency cannot create its download cache, set `npm_config_cache` to a writable project-local directory before installing. Do not disable certificate verification.

## Connect NVIDIA

Open Settings in the app, enter a NVIDIA API key, and select an exact model ID available to your account. The key entered in the UI is held in server memory until restart; it is never returned by the settings API or stored in SQLite. Saving settings does not verify endpoint access.

For configuration that survives restarts, copy `.env.example` to `.env.local` and fill in:

```dotenv
NVIDIA_API_KEY=your-key-here
NVIDIA_MODEL=nvidia/nemotron-3.5-super-vl-120b-a12b
```

Restart the server after changing environment variables. Get a key and verify endpoint availability at [NVIDIA's API catalog](https://build.nvidia.com/). The default model ID is listed in [NVIDIA's API documentation](https://docs.api.nvidia.com/nim/reference/llm-apis); access and free prototype availability can change. A NVIDIA-hosted Gemma endpoint can be selected with its `google/...` model ID. No paid fallback is selected automatically.

The model API always goes to NVIDIA's fixed HTTPS endpoint. Credentials are passed to the local worker through stdin, not command-line arguments. Do not paste keys into idea descriptions or source URLs.

The NVIDIA integration is implemented in `src/lib/nvidia.ts`. Nemotron 3.5 Super uses temperature 1, top_p 0.95, a 16,384-token output budget, seed 42, and thinking enabled, matching the supplied NVIDIA example. The app submits text evidence instead of the example image question. It receives a complete non-streaming answer, validates the report JSON and citation IDs, and ignores separate reasoning output. No tool definitions are sent, so parallel tool calls are not needed. The API key belongs in `.env.local`, not in the integration source file. That file is excluded by `.gitignore`.

## What works

- Idea submission with customer, geography, business model, and up to six source URLs.
- Automatic discovery through an experimental public Bing RSS feed; optional Tavily integration via `TAVILY_API_KEY`.
- Public-page retrieval with timeouts, download limits, robots checks, and private-network blocking with DNS pinning.
- Independent Node worker processes, persistent progress, completed reports, and failed-run retry.
- Prisma storage: Turso when both remote credentials are configured, otherwise local SQLite under `data/idea-lab.db`.
- Schema-validated NVIDIA analysis with one repair attempt for malformed output.
- Citation IDs checked against retrieved sources. Observed findings require citations.
- Report tabs, source-text inspection, local history, JSON export, and browser print/PDF for the selected section.
- A clearly labeled fictional sample report, available without a key and never inserted into research history.

## Research limits

Public RSS search is experimental and can return irrelevant results or stop working. Search snippets are not used as evidence: pages must be retrieved successfully. Supplied source URLs improve reliability but do not establish comprehensive competitor coverage. The prototype reads up to ten URLs per run, with at most 12,000 extracted characters per source and 8,500 sent to the model. Some pages require JavaScript, authentication, or block retrieval and are skipped. Unsupported documents such as PDFs are skipped in this first milestone.

Sources and warnings are saved as retrieval progresses. If no readable sources are available, the run fails instead of generating an invented report. Customer review coverage and source relevance still require human review. A matching citation ID does not prove that the cited text entails the generated claim. The application does not estimate startup success probability or present an arbitrary validation score.

Live research sends the idea and extracted evidence to NVIDIA, and idea-derived queries to Bing or configured Tavily. Research is stored in the configured database. Local SQLite is unencrypted. Review providers' terms before submitting confidential information.

The worker is a Node child process, not a managed queue. It can continue across browser navigation while the server remains running. A killed worker becomes retryable after 15 minutes without progress. The password gate protects one shared workspace: everyone with the password can see all reports and change settings. It does not provide separate user accounts, per-user data isolation, or billing.

## Render free web service

Use the Node runtime with **Node 24** and **pnpm 11.25.0** (the lockfile's package-manager generation). Set the build command to `pnpm install --frozen-lockfile && pnpm build`, and the start command to `pnpm start`. The production script binds to `0.0.0.0`; Next.js reads Render's `PORT` automatically. Do not run the development server on Render. Configure secrets in Render's environment settings; never upload `.env.local` or commit secrets.

| Variable | Configuration |
| --- | --- |
| `TURSO_DATABASE_URL` | Your Turso `libsql://...` or HTTPS database URL. |
| `TURSO_AUTH_TOKEN` | Token authorized to initialize and read/write the ResearchRun table. |
| `APP_ACCESS_PASSWORD` | Strong shared workspace password, at least 16 characters. |
| `APP_SESSION_SECRET` | Independent, randomly generated signing secret, at least 32 characters. Keep stable across restarts. |
| `APP_ORIGIN` | Exact public HTTPS origin, such as `https://your-service.onrender.com`, with no path/query. If omitted, Render's `RENDER_EXTERNAL_URL` is used. Set this explicitly when using a custom domain. |
| `NVIDIA_API_KEY` | NVIDIA credential for live analysis. Set here for persistence across service restarts. |
| `NVIDIA_MODEL` | Optional; defaults to `nvidia/nemotron-3.5-super-vl-120b-a12b`. |
| `TAVILY_API_KEY` | Optional alternative to experimental Bing RSS discovery. |

Render supplies `PORT` and normally `NODE_ENV=production`. Production returns HTTP 503 when the required access configuration is missing or invalid. Login only submits to the same origin; no external authentication provider is needed. A successful login issues an eight-hour signed, `Secure`, `HttpOnly`, `SameSite=Strict`, host-only cookie. Password or signing-secret rotation invalidates existing sessions. Logout clears the browser cookie; stateless tokens already copied elsewhere remain valid until expiry or rotation. Login attempts are limited in memory per server instance and the limit resets on restart.

When both Turso variables are present, the existing table is initialized remotely with `CREATE TABLE IF NOT EXISTS`. Local-only SQLite PRAGMAs are skipped. The schema and database API are unchanged. With either remote variable missing, SQLite remains the fallback; on Render Free this fallback is ephemeral, so configure **both** Turso variables to retain reports. Existing local records are not automatically uploaded to Turso. `prisma.config.ts` stays pointed at a local file for Prisma generation and local CLI development; runtime remote selection happens in `src/lib/db.ts`.

Turso retains saved data separately from Render's ephemeral disk. Render sleep, restarts, and redeploys can still interrupt the child-process worker. Interrupted runs can be retried after the existing 15-minute stale threshold; automatic queue recovery is not implemented. Database initialization requires a token with write/schema permissions. Actual remote connectivity must be checked with your own deployment credentials.

This is appropriate for a small trusted shared beta, not anonymous public access. Research discovery/relevance and the model's handling of vendor testimonials still need improvement. Turso does not fix those research-quality limits.

## Architecture

```text
src/app                 Next.js pages and local API routes
src/components          Workspace, report viewer, settings and dialogs
src/lib/schema.ts       Input and report contracts; citation validation
src/lib/db.ts           Prisma database functions
src/lib/database-config.ts  Local SQLite/Turso selection and initialization
src/lib/auth.ts         Server-side password comparison and signed sessions
src/proxy.ts            UI/API access gate, backed by page and API checks
src/lib/research.ts     Search, robots checks, source extraction
src/lib/safe-fetch.ts   Public-network-only retrieval and redirect checks
src/lib/nvidia.ts       NVIDIA completion calls and report validation
src/lib/jobs.ts         Independent worker launch
scripts/worker.ts       Research orchestration and progress updates
prisma/schema.prisma    Persistent research run schema
tests                   Research, validation, network policy and integration tests
```

API: `GET/POST /api/runs`, `GET /api/runs/:id`, `POST /api/runs/:id/retry`, `GET/POST /api/settings`, and `POST /api/auth/login` / `POST /api/auth/logout`. Only the login flow and necessary framework assets are accessible without a session when the gate is enabled. Existing API handlers independently verify the session and origin, even if the proxy is bypassed. Production mutations require an explicit matching Origin; cross-site Fetch Metadata is rejected. Responses never contain provider keys, passwords, or session-signing secrets.

## Verify

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm test:deployment
```

The tests cover source-network policy, extraction, report validation, API origin checks, NVIDIA error handling, and a separate worker process writing a real temporary SQLite database. Deployment tests cover local/Turso selection, initialization with and without PRAGMAs, and the real libSQL adapter using a local file transport. That test does not establish live Turso connectivity.

After a build, `pnpm test:deployment` starts isolated production servers on temporary ports with generated test-only security settings and temporary local databases. It checks real HTTP login/logout, cookie flags, UI redirects, every existing API route, CSRF checks, expiry, tampering, throttling, missing production configuration, and the `PORT` environment variable. It makes no external AI or database calls. All test servers are stopped afterward. Model responses and research sources are mocked for the worker test; actual NVIDIA/Turso access must be verified separately with live credentials.

## Next milestones

1. Evaluate live Nemotron reports on a small set of ideas and manually check citation support and competitor relevance.
2. Improve search quality and customer-discussion coverage using an available free provider or self-hosted search.
3. Apply the owner's designs, wireframes, colors, and components.
4. Add durable job recovery, per-user accounts, and research usage quotas when moving beyond a trusted shared beta.
