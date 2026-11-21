# Graph Report - crypto-notepad  (2026-11-21)

## Corpus Check
- 93 files · ~44,516 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: (none) 6, .example 1, .css 1)

## Summary
- 946 nodes · 2230 edges · 56 communities (48 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 68 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7268e31e`
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
- NotesService
- real-stores.test.ts
- api/package.json
- web/package.json
- PostgresMetadataStore
- HowItWorks.tsx
- notes.ts
- api.ts
- app.ts
- api/test/helpers.ts
- main.tsx
- accounts.test.tsx
- setup-dom.ts
- CipherField
- scripts
- PostgresSecurityStore
- SecurityGuard
- dev.mjs
- server.ts
- stores/memory.ts
- BackupService
- environment
- config.ts
- web
- App.tsx
- AdminPage.tsx
- S3BlobStore
- api
- minio
- vite.config.ts
- services
- healthcheck
- build
- scripts
- EditorPage.tsx
- admin/memory.ts
- backup.ts
- stores/memory.ts
- ViewPage.tsx
- IMetadataStore
- theme.ts
- S3BackupStorage
- Snapshot
- stores/types.ts
- IBlobStore

## God Nodes (most connected - your core abstractions)
1. `PostgresMetadataStore` - 33 edges
2. `errorMessage()` - 30 edges
3. `motionAllowed()` - 26 edges
4. `EditorPage()` - 26 edges
5. `react` - 26 edges
6. `setup()` - 24 edges
7. `SecurityGuard` - 21 edges
8. `ApiError` - 20 edges
9. `MemoryMetadataStore` - 20 edges
10. `IMetadataStore` - 20 edges

## Surprising Connections (you probably didn't know these)
- `createNote()` --calls--> `encryptNote()`  [EXTRACTED]
  apps/api/test/accounts.test.ts → packages/crypto/src/note.ts
- `Unlock()` --calls--> `decryptNote()`  [EXTRACTED]
  apps/web/src/pages/ViewPage.tsx → packages/crypto/src/note.ts
- `onSubmit()` --calls--> `decryptNote()`  [EXTRACTED]
  apps/web/src/pages/ViewPage.tsx → packages/crypto/src/note.ts
- `Unlock()` --calls--> `isSupported()`  [EXTRACTED]
  apps/web/src/pages/ViewPage.tsx → packages/crypto/src/subtle.ts
- `Unlock()` --calls--> `isCryptoError()`  [EXTRACTED]
  apps/web/src/pages/ViewPage.tsx → packages/crypto/src/errors.ts

## Import Cycles
- None detected.

## Communities (56 total, 8 thin omitted)

### Community 0 - "note.ts"
Cohesion: 0.09
Nodes (55): FAST, RFC-4648, CIPHER_ALGORITHM, DEFAULT_ITERATIONS, FORMAT_VERSION, IV_BYTES, KDF_ALGORITHM, KEY_BITS (+47 more)

### Community 1 - "postgres.ts"
Cohesion: 0.19
Nodes (4): MemoryUserStore, toUser(), LoginTakenError, User

### Community 2 - "db"
Cohesion: 0.25
Nodes (8): environment, image, ports, volumes, POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, db

### Community 3 - "package.json"
Cohesion: 0.08
Nodes (26): description, devDependencies, tsx@^4.23.15, @types/node@^22.20.5, typescript@^5.9.3, vitest@^4.1.12, engines, node (+18 more)

### Community 4 - "steps"
Cohesion: 0.14
Nodes (13): runs-on, steps, jobs, check, name, on, pull_request, push (+5 more)

### Community 5 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution, noImplicitOverride, noUncheckedIndexedAccess (+5 more)

### Community 6 - "prefs.ts"
Cohesion: 0.17
Nodes (20): GlyphBurst(), MagneticButton(), trackSpotlight(), KeyCursor(), Props, Props, cipherOf(), Props (+12 more)

### Community 7 - "crypto/package.json"
Cohesion: 0.29
Nodes (6): description, exports, name, private, type, version

### Community 8 - "tsconfig.json"
Cohesion: 0.11
Nodes (15): compilerOptions, types, extends, include, compilerOptions, jsx, lib, types (+7 more)

### Community 9 - "Crypto Notepad"
Cohesion: 0.15
Nodes (12): API (IF2 INotesApi), SkyrimCrypto, Администрирование и аудит (этап 6: FR-10, FR-11, FR-12, FR-13, FR-14, US-03, US-04), Веб-редактор (K1.1), Другие проекты автора, Запуск, Защита (этап 5: FR-12, FR-13, NFR-08, NFR-10, NFR-11, US-05), План (+4 more)

### Community 10 - "Crypto Notepad"
Cohesion: 0.40
Nodes (4): graphify, SkyrimCrypto, Правила, Скиллы проекта

### Community 12 - "real-stores.test.ts"
Cohesion: 0.14
Nodes (12): app, audit, blobs, config, created, guard, logins, metadata (+4 more)

### Community 13 - "api/package.json"
Cohesion: 0.13
Nodes (20): dependencies, @aws-sdk/client-s3@^3.1174.0, @cn/crypto@*, fastify@^5.12.8, @fastify/cookie@^11.1.5, @fastify/jwt@^10.2.8, @node-rs/argon2@^2.2.2, postgres@^3.4.9 (+12 more)

### Community 14 - "web/package.json"
Cohesion: 0.15
Nodes (16): description, devDependencies, jsdom@^31.0.1, @testing-library/dom@^10.4.2, @types/react@^19.3.0, @types/react-dom@^19.3.0, @vitejs/plugin-react@^6.3.0, name (+8 more)

### Community 16 - "HowItWorks.tsx"
Cohesion: 0.22
Nodes (13): Block(), CIPHER, HowItWorks(), PLAIN, ScrollStory(), StageProgress(), STAGES, StageVisual() (+5 more)

### Community 17 - "notes.ts"
Cohesion: 0.13
Nodes (7): CreatedNote, CreateOptions, Logger, MAX_CIPHERTEXT_BYTES, mb(), QuotaLimits, TTL_OPTIONS

### Community 18 - "api.ts"
Cohesion: 0.07
Nodes (39): Account, ApiFailure, ApiFailureCode, audit, AuditCheck, AuditReportInfo, call(), CreatedNote (+31 more)

### Community 19 - "app.ts"
Cohesion: 0.06
Nodes (37): parseReport(), GRACE_MS, ReconcileReport, AdminDeps, Ctx, registerAdminRoutes(), state, API_SECURITY_HEADERS (+29 more)

### Community 20 - "api/test/helpers.ts"
Cohesion: 0.08
Nodes (22): DEFAULT_QUOTAS, ISettingsStore, LIMITS, MB, MemorySettingsStore, SettingsService, validateQuotas(), GuardOptions (+14 more)

### Community 21 - "main.tsx"
Cohesion: 0.16
Nodes (12): dependencies, @cn/crypto@*, @fontsource/martian-mono@^5.3.0, @fontsource-variable/onest@^5.3.1, motion@^14.14.0, react@^19.3.1, react-dom@^19.3.1, @cn/crypto (+4 more)

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

### Community 26 - "PostgresSecurityStore"
Cohesion: 0.08
Nodes (13): MemoryIpBlockStore, MemorySecurityEventStore, EventDetails, EventFilter, IIpBlockStore, IpBlock, IRevokedTokenStore, ISecurityEventStore (+5 more)

### Community 28 - "dev.mjs"
Cohesion: 0.17
Nodes (11): c(), children, docker, dockerCmd(), fail(), line(), ROOT, run() (+3 more)

### Community 29 - "server.ts"
Cohesion: 0.10
Nodes (18): ALLOWED_KEYS, AuditLogger, maskDetails(), SecurityLog, AUTH_PATHS, DEFAULT_GUARD, audit, backups (+10 more)

### Community 31 - "BackupService"
Cohesion: 0.18
Nodes (5): BackupService, ISnapshotSource, sha256(), housekeeping(), timer

### Community 32 - "environment"
Cohesion: 0.17
Nodes (12): environment, API_HOST, API_PORT, COOKIE_SECURE, DATABASE_URL, JWT_SECRET, NODE_ENV, S3_ACCESS_KEY (+4 more)

### Community 33 - "config.ts"
Cohesion: 0.21
Nodes (5): Config, envFile, loadConfig(), listAll(), makeClient()

### Community 34 - "web"
Cohesion: 0.20
Nodes (10): HTTP_PORT, HTTPS_PORT, SITE_ADDRESS, web, depends_on, environment, ports, profiles (+2 more)

### Community 35 - "App.tsx"
Cohesion: 0.15
Nodes (25): Header(), NavLink(), Shell(), ThemeToggle(), RoleGate(), readHidden(), VpnPromo(), EASE_OUT (+17 more)

### Community 36 - "AdminPage.tsx"
Cohesion: 0.15
Nodes (28): admin, BackupManifest, IpBlockInfo, Overview, ReconcileReport, SecurityEventInfo, Alert(), errorMessage() (+20 more)

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

### Community 44 - "scripts"
Cohesion: 0.50
Nodes (4): scripts, dev, set-role, start

### Community 45 - "EditorPage.tsx"
Cohesion: 0.16
Nodes (16): ServerView(), COLORS, LABELS, passwordScore(), StrengthMeter(), formatBytes(), NoteDocument, serializeDocument() (+8 more)

### Community 46 - "admin/memory.ts"
Cohesion: 0.21
Nodes (4): AuditCheck, AuditReport, IAuditReportStore, MemoryAuditReportStore

### Community 47 - "backup.ts"
Cohesion: 0.16
Nodes (6): BackupManifest, dec, enc, IBackupStorage, MemoryBackupStorage, RestoreReport

### Community 48 - "stores/memory.ts"
Cohesion: 0.18
Nodes (4): MemoryBlobStore, Row, BlobInfo, NoteMetadata

### Community 49 - "ViewPage.tsx"
Cohesion: 0.28
Nodes (9): LockIcon(), PasswordField(), parseDocument(), sleep(), Load, NewNoteButton(), Unlock(), onSubmit() (+1 more)

### Community 50 - "IMetadataStore"
Cohesion: 0.20
Nodes (3): reconcile(), app, IMetadataStore

### Community 51 - "theme.ts"
Cohesion: 0.29
Nodes (9): Footer(), applyTheme(), DocWithVT, initialTheme(), playLockClick(), setSoundEnabled(), soundEnabled(), Theme (+1 more)

### Community 54 - "stores/types.ts"
Cohesion: 0.50
Nodes (3): db, [login, role], ROLES

## Knowledge Gaps
- **3 isolated node(s):** `RFC-4648`, `RFC-7914`, `RFC-7914`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 336 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `api/test/helpers.ts` to `note.ts`, `package.json`, `real-stores.test.ts`, `api.ts`, `accounts.test.tsx`, `server.ts`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **What connects `RFC-4648`, `RFC-7914`, `RFC-7914` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `note.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08772635814889336 - nodes in this community are weakly interconnected._
- **Why does `PostgresMetadataStore` connect `PostgresMetadataStore` to `postgres.ts`, `real-stores.test.ts`, `stores/memory.ts`, `IMetadataStore`, `app.ts`, `api/test/helpers.ts`, `Snapshot`, `stores/types.ts`, `PostgresSecurityStore`, `server.ts`, `stores/memory.ts`, `BackupService`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08262108262108261 - nodes in this community are weakly interconnected._
- **Why does `react` connect `prefs.ts` to `App.tsx`, `AdminPage.tsx`, `EditorPage.tsx`, `web/package.json`, `HowItWorks.tsx`, `ViewPage.tsx`, `api.ts`, `theme.ts`, `main.tsx`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Should `steps` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._