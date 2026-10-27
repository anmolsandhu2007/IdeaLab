# Idea Lab

A local prototype for researching startup ideas with NVIDIA-hosted Nemotron or Gemma models. Describe an idea, retrieve public evidence, and read a structured report with competitors, customer pain signals, opportunities, risks, and improvement suggestions.

## Run locally

Requires Node.js 22.12+ (Node 24 recommended), pnpm, and an internet connection for live research. No local AI runtime or GPU is required.

```powershell
pnpm install
pnpm db:generate
pnpm dev
```

Open **http://127.0.0.1:3000**. The server binds to loopback. This is a single-user local app; do not expose it to the internet without authentication and deployment hardening.

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
- SQLite storage through Prisma, created automatically under `data/idea-lab.db`.
- Schema-validated NVIDIA analysis with one repair attempt for malformed output.
- Citation IDs checked against retrieved sources. Observed findings require citations.
- Report tabs, source-text inspection, local history, JSON export, and browser print/PDF for the selected section.
- A clearly labeled fictional sample report, available without a key and never inserted into research history.

## Research limits

Public RSS search is experimental and can return irrelevant results or stop working. Search snippets are not used as evidence: pages must be retrieved successfully. Supplied source URLs improve reliability but do not establish comprehensive competitor coverage. The prototype reads up to ten URLs per run, with at most 12,000 extracted characters per source and 8,500 sent to the model. Some pages require JavaScript, authentication, or block retrieval and are skipped. Unsupported documents such as PDFs are skipped in this first milestone.

Sources and warnings are saved as retrieval progresses. If no readable sources are available, the run fails instead of generating an invented report. Customer review coverage and source relevance still require human review. A matching citation ID does not prove that the cited text entails the generated claim. The application does not estimate startup success probability or present an arbitrary validation score.

Live research sends the idea and extracted evidence to NVIDIA, and idea-derived queries to Bing or configured Tavily. Stored research is local and unencrypted. Use non-sensitive ideas during evaluation and review providers' terms before submitting confidential information.

The worker is a local child process, not a managed queue. It can continue across browser navigation and app reloads while the computer remains on. A killed worker becomes retryable after 15 minutes without progress. This is not yet a production multi-user service, and there is no login or billing.

## Architecture

```text
src/app                 Next.js pages and local API routes
src/components          Workspace, report viewer, settings and dialogs
src/lib/schema.ts       Input and report contracts; citation validation
src/lib/db.ts           Prisma and local SQLite persistence
src/lib/research.ts     Search, robots checks, source extraction
src/lib/safe-fetch.ts   Public-network-only retrieval and redirect checks
src/lib/nvidia.ts       NVIDIA completion calls and report validation
src/lib/jobs.ts         Independent worker launch
scripts/worker.ts       Research orchestration and progress updates
prisma/schema.prisma    Persistent research run schema
tests                   Research, validation, network policy and integration tests
```

API: `GET/POST /api/runs`, `GET /api/runs/:id`, `POST /api/runs/:id/retry`, and `GET/POST /api/settings`. Responses never contain provider keys. The local API rejects non-local hosts and cross-origin requests.

## Verify

```powershell
pnpm test
pnpm typecheck
pnpm build
```

The tests cover source-network policy, extraction, report validation, API origin checks, NVIDIA error handling, and a separate worker process writing a real temporary SQLite database. Model responses and research sources are mocked for the worker test; it makes no paid calls. Actual NVIDIA access must be verified with a real key. Live retrieval checks are separate from deterministic tests.

## Next milestones

1. Evaluate live Nemotron reports on a small set of ideas and manually check citation support and competitor relevance.
2. Improve search quality and customer-discussion coverage using an available free provider or self-hosted search.
3. Apply the owner's designs, wireframes, colors, and components.
4. Add login, deployment storage, durable jobs, and usage controls when moving beyond local evaluation.
