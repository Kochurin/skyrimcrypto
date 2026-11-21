# Graph Report - crypto-notepad  (2026-11-21)

## Corpus Check
- 104 files · ~47,681 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 6, .example 1, .webmanifest 1)

## Summary
- 1006 nodes · 2335 edges · 56 communities (53 shown, 3 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 72 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5c6e6b29`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- note.ts
- postgres.ts
- db
- package.json
- steps
- compilerOptions
- prefs.ts
- crypto/package.json
- tsconfig.json
- Crypto Notepad
- Crypto Notepad
- IMetadataStore
- real-stores.test.ts
- api/package.json
- web/package.json
- PostgresMetadataStore
- HowItWorks.tsx
- notes.ts
- api.ts
- auth.ts
- api/test/helpers.ts
- main.tsx
- accounts.test.tsx
- setup-dom.ts
- CipherField
- scripts
- postgres.ts
- SecurityGuard
- dev.mjs
- server.ts
- stores/memory.ts
- zk-audit.ts
- environment
- config.ts
- web
- App.tsx
- AdminPage.tsx
- s3.ts
- api
- minio
- vite.config.ts
- services
- healthcheck
- build
- app.ts
- EditorPage.tsx
- PostgresSecurityStore
- backup.ts
- api/test/helpers.ts
- ViewPage.tsx
- memory-server.ts
- ApiError
- notes.k6.js
- MemoryIpBlockStore
- routes.ts
- sw.js

## God Nodes (most connected - your core abstractions)
1. `PostgresMetadataStore` - 33 edges
2. `errorMessage()` - 30 edges
3. `EditorPage()` - 26 edges
4. `motionAllowed()` - 26 edges
5. `react` - 26 edges
6. `setup()` - 24 edges
7. `SecurityGuard` - 22 edges
8. `MemoryMetadataStore` - 21 edges
9. `ApiError` - 20 edges
10. `IMetadataStore` - 20 edges

## Surprising Connections (you probably didn't know these)
- `createNote()` --calls--> `encryptNote()`  [EXTRACTED]
  apps/api/test/accounts.test.ts → packages/crypto/src/note.ts
- `Unlock()` --calls--> `isCryptoError()`  [EXTRACTED]
  apps/web/src/pages/ViewPage.tsx → packages/crypto/src/errors.ts
- `onSubmit()` --calls--> `isCryptoError()`  [EXTRACTED]
  apps/web/src/pages/ViewPage.tsx → packages/crypto/src/errors.ts
- `Unlock()` --calls--> `decryptNote()`  [EXTRACTED]
  apps/web/src/pages/ViewPage.tsx → packages/crypto/src/note.ts
- `onSubmit()` --calls--> `decryptNote()`  [EXTRACTED]
  apps/web/src/pages/ViewPage.tsx → packages/crypto/src/note.ts

## Import Cycles
- None detected.

## Communities (56 total, 3 thin omitted)

### Community 0 - "note.ts"
Cohesion: 0.08
Nodes (56): FAST, RFC-4648, CIPHER_ALGORITHM, DEFAULT_ITERATIONS, FORMAT_VERSION, IV_BYTES, KDF_ALGORITHM, KEY_BITS (+48 more)

### Community 1 - "postgres.ts"
Cohesion: 0.21
Nodes (4): MemoryUserStore, toUser(), LoginTakenError, User

### Community 2 - "db"
Cohesion: 0.25
Nodes (8): environment, image, ports, volumes, POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, db

### Community 3 - "package.json"
Cohesion: 0.05
Nodes (35): description, devDependencies, @playwright/test@^1.65.1, tsx@^4.23.15, @types/node@^22.20.5, typescript@^5.9.3, vitest@^4.1.12, @vitest/coverage-v8@^4.1.12 (+27 more)

### Community 4 - "steps"
Cohesion: 0.14
Nodes (13): runs-on, steps, jobs, check, name, on, pull_request, push (+5 more)

### Community 5 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution, noImplicitOverride, noUncheckedIndexedAccess (+5 more)

### Community 6 - "prefs.ts"
Cohesion: 0.20
Nodes (11): trackSpotlight(), Props, readHidden(), VpnPromo(), CIPHER_GLYPHS, EASE_IN, SPRING, SPRING_IN (+3 more)

### Community 7 - "crypto/package.json"
Cohesion: 0.29
Nodes (6): description, exports, name, private, type, version

### Community 8 - "tsconfig.json"
Cohesion: 0.11
Nodes (15): compilerOptions, types, extends, include, compilerOptions, jsx, lib, types (+7 more)

### Community 9 - "Crypto Notepad"
Cohesion: 0.14
Nodes (13): API (IF2 INotesApi), PWA, SkyrimCrypto, Администрирование и аудит (этап 6: FR-10, FR-11, FR-12, FR-13, FR-14, US-03, US-04), Веб-редактор (K1.1), Другие проекты автора, Запуск, Защита (этап 5: FR-12, FR-13, NFR-08, NFR-10, NFR-11, US-05) (+5 more)

### Community 10 - "Crypto Notepad"
Cohesion: 0.40
Nodes (4): graphify, SkyrimCrypto, Правила, Скиллы проекта

### Community 11 - "IMetadataStore"
Cohesion: 0.14
Nodes (4): mb(), NotesService, IBlobStore, IMetadataStore

### Community 12 - "real-stores.test.ts"
Cohesion: 0.14
Nodes (13): SESSION_COOKIE, app, audit, blobs, config, created, guard, logins (+5 more)

### Community 13 - "api/package.json"
Cohesion: 0.11
Nodes (23): dependencies, @aws-sdk/client-s3@^3.1174.0, @cn/crypto@*, fastify@^5.12.8, @fastify/cookie@^11.1.5, @fastify/jwt@^10.2.8, @node-rs/argon2@^2.2.2, postgres@^3.4.9 (+15 more)

### Community 14 - "web/package.json"
Cohesion: 0.15
Nodes (16): description, devDependencies, jsdom@^31.0.1, @testing-library/dom@^10.4.2, @types/react@^19.3.0, @types/react-dom@^19.3.0, @vitejs/plugin-react@^6.3.0, name (+8 more)

### Community 15 - "PostgresMetadataStore"
Cohesion: 0.09
Nodes (4): Snapshot, MemorySnapshotSource, Quotas, PostgresMetadataStore

### Community 16 - "HowItWorks.tsx"
Cohesion: 0.22
Nodes (13): Block(), CIPHER, HowItWorks(), PLAIN, ScrollStory(), StageProgress(), STAGES, StageVisual() (+5 more)

### Community 17 - "notes.ts"
Cohesion: 0.13
Nodes (7): AuditCheck, CreatedNote, CreateOptions, Logger, MAX_CIPHERTEXT_BYTES, QuotaLimits, TTL_OPTIONS

### Community 18 - "api.ts"
Cohesion: 0.14
Nodes (28): Account, ApiFailure, ApiFailureCode, call(), createNote(), deleteNote(), failure(), fetchMe() (+20 more)

### Community 19 - "auth.ts"
Cohesion: 0.15
Nodes (8): AuthService, INVALID(), LOCK_MINUTES, MAX_ACCOUNT_PASSWORD, MAX_FAILED_ATTEMPTS, MIN_ACCOUNT_PASSWORD, normalizeLogin(), IUserStore

### Community 20 - "api/test/helpers.ts"
Cohesion: 0.11
Nodes (11): DEFAULT_QUOTAS, ISettingsStore, LIMITS, MB, MemorySettingsStore, SettingsService, validateQuotas(), notes (+3 more)

### Community 21 - "main.tsx"
Cohesion: 0.13
Nodes (14): dependencies, @cn/crypto@*, @fontsource/martian-mono@^5.3.0, @fontsource-variable/onest@^5.3.1, motion@^14.14.0, react@^19.3.1, react-dom@^19.3.1, @cn/crypto (+6 more)

### Community 22 - "accounts.test.tsx"
Cohesion: 0.19
Nodes (9): @testing-library/react@^16.3.3, @testing-library/user-event@^14.6.13, App(), FakeNote, fakeServer(), json(), createNote(), @testing-library/react (+1 more)

### Community 23 - "setup-dom.ts"
Cohesion: 0.25
Nodes (3): @testing-library/jest-dom@^8.0.0, NoopIntersectionObserver, @testing-library/jest-dom

### Community 24 - "CipherField"
Cohesion: 0.47
Nodes (4): CipherField(), draw(), loop(), resize()

### Community 25 - "scripts"
Cohesion: 0.50
Nodes (4): scripts, build, dev, preview

### Community 26 - "postgres.ts"
Cohesion: 0.11
Nodes (15): ALLOWED_KEYS, AuditLogger, maskDetails(), SecurityLog, MemorySecurityEventStore, EventDetails, EventFilter, IIpBlockStore (+7 more)

### Community 28 - "dev.mjs"
Cohesion: 0.11
Nodes (15): c(), children, docker, dockerCmd(), fail(), line(), ROOT, run() (+7 more)

### Community 29 - "server.ts"
Cohesion: 0.12
Nodes (15): reconcile(), app, audit, backups, backupStorage, blobs, config, db (+7 more)

### Community 30 - "stores/memory.ts"
Cohesion: 0.16
Nodes (4): MemoryMetadataStore, Row, NoteMetadata, NoteSummary

### Community 31 - "zk-audit.ts"
Cohesion: 0.08
Nodes (15): AuditCheck, CreatedNote, AuditDeps, AuditStep, b64(), bodyText(), Captured, captureTraffic() (+7 more)

### Community 32 - "environment"
Cohesion: 0.17
Nodes (12): environment, API_HOST, API_PORT, COOKIE_SECURE, DATABASE_URL, JWT_SECRET, NODE_ENV, S3_ACCESS_KEY (+4 more)

### Community 33 - "config.ts"
Cohesion: 0.29
Nodes (4): db, [login, role], envFile, loadConfig()

### Community 34 - "web"
Cohesion: 0.20
Nodes (10): HTTP_PORT, HTTPS_PORT, SITE_ADDRESS, web, depends_on, environment, ports, profiles (+2 more)

### Community 35 - "App.tsx"
Cohesion: 0.13
Nodes (30): audit, AuditReportInfo, Footer(), Header(), NavLink(), Shell(), ThemeToggle(), MagneticButton() (+22 more)

### Community 36 - "AdminPage.tsx"
Cohesion: 0.16
Nodes (26): admin, BackupManifest, IpBlockInfo, Overview, ReconcileReport, SecurityEventInfo, Alert(), errorMessage() (+18 more)

### Community 37 - "s3.ts"
Cohesion: 0.12
Nodes (7): Config, getBytes(), listAll(), makeClient(), S3BackupStorage, S3BlobStore, BlobInfo

### Community 38 - "api"
Cohesion: 0.25
Nodes (8): depends_on, profiles, restart, condition, db, minio, condition, api

### Community 39 - "minio"
Cohesion: 0.25
Nodes (8): MINIO_DEFAULT_BUCKETS, MINIO_ROOT_PASSWORD, MINIO_ROOT_USER, environment, image, ports, volumes, minio

### Community 40 - "vite.config.ts"
Cohesion: 0.38
Nodes (5): vite@^8.3.8, CSP, SECURITY_HEADERS, api, vite

### Community 41 - "services"
Cohesion: 0.33
Nodes (5): services, volumes, caddy-data, db-data, minio-data

### Community 42 - "healthcheck"
Cohesion: 0.60
Nodes (5): healthcheck, interval, retries, test, healthcheck

### Community 43 - "build"
Cohesion: 0.67
Nodes (4): build, context, target, build

### Community 44 - "app.ts"
Cohesion: 0.12
Nodes (13): API_SECURITY_HEADERS, AppDeps, AuditInfo, BODY_LIMIT, credentialsSchema, fastify, @fastify/jwt, FastifyJWT (+5 more)

### Community 45 - "EditorPage.tsx"
Cohesion: 0.12
Nodes (20): TTL_OPTIONS, TtlDays, ServerView(), COLORS, LABELS, passwordScore(), StrengthMeter(), formatBytes() (+12 more)

### Community 46 - "PostgresSecurityStore"
Cohesion: 0.13
Nodes (4): AuditReport, IAuditReportStore, MemoryAuditReportStore, PostgresSecurityStore

### Community 47 - "backup.ts"
Cohesion: 0.13
Nodes (9): BackupManifest, BackupService, dec, enc, IBackupStorage, ISnapshotSource, MemoryBackupStorage, RestoreReport (+1 more)

### Community 48 - "api/test/helpers.ts"
Cohesion: 0.12
Nodes (15): AUTH_PATHS, DEFAULT_GUARD, GuardOptions, SlidingWindow, MemoryBlobStore, createNote(), FAST, asRole() (+7 more)

### Community 49 - "ViewPage.tsx"
Cohesion: 0.20
Nodes (17): GlyphBurst(), LockIcon(), PasswordField(), Props, cipherOf(), Props, Scramble(), parseDocument() (+9 more)

### Community 50 - "memory-server.ts"
Cohesion: 0.12
Nodes (13): app, audit, backups, blobs, events, guard, log, metadata (+5 more)

### Community 51 - "ApiError"
Cohesion: 0.24
Nodes (9): parseReport(), registerAdminRoutes(), buildApp(), optionalUser(), requireRole(), requireUser(), eventType(), trustHops() (+1 more)

### Community 52 - "notes.k6.js"
Cohesion: 0.31
Nodes (8): b64(), JSON_HEADERS, makePackage(), mixed(), options, pick(), reader(), setup()

### Community 54 - "routes.ts"
Cohesion: 0.26
Nodes (8): GRACE_MS, ReconcileReport, AdminDeps, Ctx, state, SessionUser, Role, ROLES

## Knowledge Gaps
- **3 isolated node(s):** `RFC-4648`, `RFC-7914`, `RFC-7914`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 368 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `note.ts` to `package.json`, `real-stores.test.ts`, `EditorPage.tsx`, `api/test/helpers.ts`, `accounts.test.tsx`, `zk-audit.ts`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **What connects `RFC-4648`, `RFC-7914`, `RFC-7914` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `note.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08293224731580896 - nodes in this community are weakly interconnected._
- **Why does `PostgresMetadataStore` connect `PostgresMetadataStore` to `config.ts`, `postgres.ts`, `IMetadataStore`, `real-stores.test.ts`, `PostgresSecurityStore`, `backup.ts`, `auth.ts`, `api/test/helpers.ts`, `postgres.ts`, `server.ts`, `stores/memory.ts`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.0507399577167019 - nodes in this community are weakly interconnected._
- **Why does `motion` connect `prefs.ts` to `App.tsx`, `AdminPage.tsx`, `EditorPage.tsx`, `web/package.json`, `HowItWorks.tsx`, `ViewPage.tsx`, `api.ts`, `main.tsx`, `setup-dom.ts`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Should `steps` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._