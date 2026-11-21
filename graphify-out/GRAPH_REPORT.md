# Graph Report - crypto-notepad  (2026-11-21)

## Corpus Check
- 66 files · ~22,197 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .example 1, .css 1)

## Summary
- 567 nodes · 1289 edges · 26 communities (24 shown, 2 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `87e82dca`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- note.ts
- notes-api.test.ts
- db
- package.json
- steps
- compilerOptions
- EditorPage.tsx
- crypto/package.json
- tsconfig.json
- Crypto Notepad
- Crypto Notepad
- PostgresMetadataStore
- server.ts
- api/package.json
- web/package.json
- api.ts
- MemoryBlobStore
- real-stores.test.ts
- AuthService
- app.ts
- api/test/helpers.ts
- main.tsx
- accounts.test.tsx
- setup-dom.ts
- buildApp
- scripts

## God Nodes (most connected - your core abstractions)
1. `EditorPage()` - 27 edges
2. `PostgresMetadataStore` - 20 edges
3. `encryptNote()` - 19 edges
4. `errorMessage()` - 17 edges
5. `Unlock()` - 17 edges
6. `CryptoError` - 17 edges
7. `react` - 16 edges
8. `motionAllowed()` - 16 edges
9. `NotesService` - 15 edges
10. `navigate()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `createNote()` --calls--> `encryptNote()`  [EXTRACTED]
  apps/api/test/accounts.test.ts → packages/crypto/src/note.ts
- `buildApp()` --calls--> `isCryptoError()`  [EXTRACTED]
  apps/api/src/app.ts → packages/crypto/src/errors.ts
- `EditorPage()` --calls--> `validateNewPassword()`  [EXTRACTED]
  apps/web/src/pages/EditorPage.tsx → packages/crypto/src/kdf.ts
- `EditorPage()` --calls--> `encryptNote()`  [EXTRACTED]
  apps/web/src/pages/EditorPage.tsx → packages/crypto/src/note.ts
- `EditorPage()` --calls--> `isSupported()`  [EXTRACTED]
  apps/web/src/pages/EditorPage.tsx → packages/crypto/src/subtle.ts

## Import Cycles
- None detected.

## Communities (26 total, 2 thin omitted)

### Community 0 - "note.ts"
Cohesion: 0.07
Nodes (56): CreatedNote, CreateOptions, Logger, TTL_OPTIONS, RFC-4648, CIPHER_ALGORITHM, DEFAULT_ITERATIONS, FORMAT_VERSION (+48 more)

### Community 2 - "db"
Cohesion: 0.09
Nodes (25): environment, healthcheck, image, ports, volumes, MINIO_DEFAULT_BUCKETS, MINIO_ROOT_PASSWORD, MINIO_ROOT_USER (+17 more)

### Community 3 - "package.json"
Cohesion: 0.09
Nodes (24): description, devDependencies, tsx@^4.23.15, @types/node@^22.20.5, typescript@^5.9.3, vitest@^4.1.12, engines, node (+16 more)

### Community 4 - "steps"
Cohesion: 0.14
Nodes (13): runs-on, steps, jobs, check, name, on, pull_request, push (+5 more)

### Community 5 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution, noImplicitOverride, noUncheckedIndexedAccess (+5 more)

### Community 6 - "EditorPage.tsx"
Cohesion: 0.07
Nodes (70): deleteNote(), NoteSummary, Header(), NavLink(), Shell(), Alert(), CipherField(), draw() (+62 more)

### Community 7 - "crypto/package.json"
Cohesion: 0.29
Nodes (6): description, exports, name, private, type, version

### Community 8 - "tsconfig.json"
Cohesion: 0.11
Nodes (15): compilerOptions, types, extends, include, compilerOptions, jsx, lib, types (+7 more)

### Community 9 - "Crypto Notepad"
Cohesion: 0.20
Nodes (9): API (IF2 INotesApi), SkyrimCrypto, Веб-редактор (K1.1), Запуск, План, Структура (компоненты из ЛР7), Тесты, Учётные записи (FR-01, FR-05, FR-06, FR-09) (+1 more)

### Community 10 - "Crypto Notepad"
Cohesion: 0.40
Nodes (4): graphify, SkyrimCrypto, Правила, Скиллы проекта

### Community 11 - "PostgresMetadataStore"
Cohesion: 0.05
Nodes (17): NotesService, MemoryMetadataStore, MemoryUserStore, Row, MIGRATIONS, NoteRow, PostgresMetadataStore, toUser() (+9 more)

### Community 12 - "server.ts"
Cohesion: 0.11
Nodes (11): Config, envFile, loadConfig(), app, blobs, config, db, notes (+3 more)

### Community 13 - "api/package.json"
Cohesion: 0.11
Nodes (23): dependencies, @aws-sdk/client-s3@^3.1174.0, @cn/crypto@*, fastify@^5.12.8, @fastify/cookie@^11.1.5, @fastify/jwt@^10.2.8, @node-rs/argon2@^2.2.2, postgres@^3.4.9 (+15 more)

### Community 14 - "web/package.json"
Cohesion: 0.14
Nodes (18): description, devDependencies, jsdom@^31.0.1, @testing-library/dom@^10.4.2, @types/react@^19.3.0, @types/react-dom@^19.3.0, vite@^8.3.8, @vitejs/plugin-react@^6.3.0 (+10 more)

### Community 15 - "api.ts"
Cohesion: 0.20
Nodes (19): Account, ApiFailure, ApiFailureCode, CreatedNote, createNote(), failure(), fetchMe(), fetchNote() (+11 more)

### Community 17 - "real-stores.test.ts"
Cohesion: 0.20
Nodes (9): app, blobs, config, created, logins, metadata, s3, service (+1 more)

### Community 18 - "AuthService"
Cohesion: 0.20
Nodes (6): AppDeps, AuthService, INVALID(), normalizeLogin(), ApiError, IUserStore

### Community 19 - "app.ts"
Cohesion: 0.15
Nodes (12): BODY_LIMIT, credentialsSchema, @fastify/jwt, FastifyJWT, SESSION_HOURS, TokenPayload, LOCK_MINUTES, MAX_ACCOUNT_PASSWORD (+4 more)

### Community 20 - "api/test/helpers.ts"
Cohesion: 0.20
Nodes (8): SESSION_COOKIE, createNote(), FAST, App, apps, register(), sessionCookie(), vitest

### Community 21 - "main.tsx"
Cohesion: 0.16
Nodes (12): dependencies, @cn/crypto@*, @fontsource/martian-mono@^5.3.0, @fontsource-variable/onest@^5.3.1, motion@^14.14.0, react@^19.3.1, react-dom@^19.3.1, @cn/crypto (+4 more)

### Community 22 - "accounts.test.tsx"
Cohesion: 0.19
Nodes (9): @testing-library/react@^16.3.3, @testing-library/user-event@^14.6.13, App(), FakeNote, fakeServer(), json(), createNote(), @testing-library/react (+1 more)

### Community 23 - "setup-dom.ts"
Cohesion: 0.25
Nodes (3): @testing-library/jest-dom@^8.0.0, NoopIntersectionObserver, @testing-library/jest-dom

### Community 24 - "buildApp"
Cohesion: 0.50
Nodes (4): buildApp(), optionalUser(), requireUser(), setup()

### Community 25 - "scripts"
Cohesion: 0.50
Nodes (4): scripts, build, dev, preview

## Knowledge Gaps
- **3 isolated node(s):** `RFC-4648`, `RFC-7914`, `RFC-7914`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 209 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `api/test/helpers.ts` to `note.ts`, `notes-api.test.ts`, `package.json`, `EditorPage.tsx`, `real-stores.test.ts`, `accounts.test.tsx`?**
  _High betweenness centrality (0.129) - this node is a cross-community bridge._
- **What connects `RFC-4648`, `RFC-7914`, `RFC-7914` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `note.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07367737747484583 - nodes in this community are weakly interconnected._
- **Why does `motion` connect `EditorPage.tsx` to `main.tsx`, `web/package.json`, `setup-dom.ts`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Should `db` be split into smaller, more focused modules?**
  _Cohesion score 0.08615384615384615 - nodes in this community are weakly interconnected._
- **Why does `PostgresMetadataStore` connect `PostgresMetadataStore` to `real-stores.test.ts`, `AuthService`, `server.ts`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._