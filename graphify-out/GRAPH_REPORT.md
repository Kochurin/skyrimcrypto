# Graph Report - crypto-notepad  (2026-11-21)

## Corpus Check
- 51 files · ~11,677 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .example 1, .css 1)

## Summary
- 393 nodes · 762 edges · 19 communities (18 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0170e9c3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- note.ts
- notes.ts
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
- NotesService
- MemoryBlobStore
- real-stores.test.ts
- app.ts

## God Nodes (most connected - your core abstractions)
1. `CryptoError` - 16 edges
2. `EditorPage()` - 14 edges
3. `encryptNote()` - 13 edges
4. `compilerOptions` - 13 edges
5. `S3BlobStore` - 12 edges
6. `vitest` - 11 edges
7. `NotesService` - 11 edges
8. `EncryptedPackage` - 11 edges
9. `IBlobStore` - 11 edges
10. `PostgresMetadataStore` - 11 edges

## Surprising Connections (you probably didn't know these)
- `buildApp()` --calls--> `isCryptoError()`  [EXTRACTED]
  apps/api/src/app.ts → packages/crypto/src/errors.ts
- `AppDeps` --references--> `NotesService`  [EXTRACTED]
  apps/api/src/app.ts → apps/api/src/notes.ts
- `createNote()` --calls--> `App()`  [EXTRACTED]
  apps/web/test/app.test.tsx → apps/web/src/App.tsx
- `setup()` --calls--> `NotesService`  [EXTRACTED]
  apps/api/test/notes-api.test.ts → apps/api/src/notes.ts
- `S3BlobStore` --implements--> `IBlobStore`  [EXTRACTED]
  apps/api/src/stores/s3.ts → apps/api/src/stores/types.ts

## Import Cycles
- None detected.

## Communities (19 total, 1 thin omitted)

### Community 0 - "note.ts"
Cohesion: 0.11
Nodes (48): RFC-4648, CIPHER_ALGORITHM, DEFAULT_ITERATIONS, FORMAT_VERSION, IV_BYTES, KDF_ALGORITHM, KEY_BITS, MAX_ITERATIONS (+40 more)

### Community 1 - "notes.ts"
Cohesion: 0.13
Nodes (5): CreatedNote, Logger, apps, FAST, TAG_BYTES

### Community 2 - "db"
Cohesion: 0.09
Nodes (25): environment, healthcheck, image, ports, volumes, MINIO_DEFAULT_BUCKETS, MINIO_ROOT_PASSWORD, MINIO_ROOT_USER (+17 more)

### Community 3 - "package.json"
Cohesion: 0.07
Nodes (30): description, devDependencies, tsx@^4.23.15, @types/node@^22.20.5, typescript@^5.9.3, vitest@^4.1.12, engines, node (+22 more)

### Community 4 - "steps"
Cohesion: 0.14
Nodes (13): runs-on, steps, jobs, check, name, on, pull_request, push (+5 more)

### Community 5 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution, noImplicitOverride, noUncheckedIndexedAccess (+5 more)

### Community 6 - "EditorPage.tsx"
Cohesion: 0.09
Nodes (34): ApiFailure, ApiFailureCode, CreatedNote, createNote(), failure(), fetchNote(), send(), App() (+26 more)

### Community 7 - "crypto/package.json"
Cohesion: 0.29
Nodes (6): description, exports, name, private, type, version

### Community 8 - "tsconfig.json"
Cohesion: 0.11
Nodes (15): compilerOptions, types, extends, include, compilerOptions, jsx, lib, types (+7 more)

### Community 9 - "Crypto Notepad"
Cohesion: 0.22
Nodes (8): API (IF2 INotesApi), Crypto Notepad, Веб-редактор (K1.1), Запуск, План, Структура (компоненты из ЛР7), Тесты, Формат зашифрованного пакета (v1)

### Community 10 - "Crypto Notepad"
Cohesion: 0.40
Nodes (4): Crypto Notepad, graphify, Правила, Скиллы проекта

### Community 11 - "PostgresMetadataStore"
Cohesion: 0.18
Nodes (5): MIGRATIONS, NoteRow, PostgresMetadataStore, IMetadataStore, NoteMetadata

### Community 12 - "server.ts"
Cohesion: 0.13
Nodes (8): Config, envFile, loadConfig(), app, blobs, config, metadata, S3BlobStore

### Community 13 - "api/package.json"
Cohesion: 0.13
Nodes (18): dependencies, @aws-sdk/client-s3@^3.1174.0, @cn/crypto@*, fastify@^5.12.8, postgres@^3.4.9, description, name, private (+10 more)

### Community 14 - "web/package.json"
Cohesion: 0.08
Nodes (32): dependencies, react@^19.3.1, react-dom@^19.3.1, description, devDependencies, jsdom@^31.0.1, @testing-library/dom@^10.4.2, @testing-library/jest-dom@^8.0.0 (+24 more)

### Community 16 - "MemoryBlobStore"
Cohesion: 0.24
Nodes (3): MemoryBlobStore, MemoryMetadataStore, setup()

### Community 17 - "real-stores.test.ts"
Cohesion: 0.22
Nodes (7): app, blobs, config, created, metadata, s3, sql

### Community 18 - "app.ts"
Cohesion: 0.29
Nodes (5): AppDeps, BODY_LIMIT, buildApp(), ApiError, MAX_CIPHERTEXT_BYTES

## Knowledge Gaps
- **3 isolated node(s):** `RFC-4648`, `RFC-7914`, `RFC-7914`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 162 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `package.json` to `note.ts`, `real-stores.test.ts`, `notes.ts`, `EditorPage.tsx`?**
  _High betweenness centrality (0.144) - this node is a cross-community bridge._
- **What connects `RFC-4648`, `RFC-7914`, `RFC-7914` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `note.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1119177253478524 - nodes in this community are weakly interconnected._
- **Why does `react` connect `EditorPage.tsx` to `web/package.json`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Should `notes.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1323529411764706 - nodes in this community are weakly interconnected._
- **Why does `S3BlobStore` connect `server.ts` to `real-stores.test.ts`, `NotesService`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Should `db` be split into smaller, more focused modules?**
  _Cohesion score 0.08615384615384615 - nodes in this community are weakly interconnected._