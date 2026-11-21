# Graph Report - crypto-notepad  (2026-11-21)

## Corpus Check
- 35 files · ~8,042 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 3, .example 1)

## Summary
- 293 nodes · 543 edges · 14 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3a166bee`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- note.ts
- notes.ts
- db
- package.json
- steps
- compilerOptions
- kdf.test.ts
- crypto/package.json
- tsconfig.json
- Crypto Notepad
- Crypto Notepad
- PostgresMetadataStore
- server.ts
- api/package.json

## God Nodes (most connected - your core abstractions)
1. `CryptoError` - 16 edges
2. `encryptNote()` - 13 edges
3. `compilerOptions` - 13 edges
4. `S3BlobStore` - 12 edges
5. `NotesService` - 11 edges
6. `PostgresMetadataStore` - 11 edges
7. `IBlobStore` - 11 edges
8. `EncryptedPackage` - 11 edges
9. `decryptNote()` - 11 edges
10. `toBase64Url()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `buildApp()` --calls--> `isCryptoError()`  [EXTRACTED]
  apps/api/src/app.ts → packages/crypto/src/errors.ts
- `AppDeps` --references--> `NotesService`  [EXTRACTED]
  apps/api/src/app.ts → apps/api/src/notes.ts
- `setup()` --calls--> `buildApp()`  [EXTRACTED]
  apps/api/test/notes-api.test.ts → apps/api/src/app.ts
- `setup()` --calls--> `NotesService`  [EXTRACTED]
  apps/api/test/notes-api.test.ts → apps/api/src/notes.ts
- `MemoryBlobStore` --implements--> `IBlobStore`  [EXTRACTED]
  apps/api/src/stores/memory.ts → apps/api/src/stores/types.ts

## Import Cycles
- None detected.

## Communities (14 total, 0 thin omitted)

### Community 0 - "note.ts"
Cohesion: 0.12
Nodes (46): RFC-4648, CIPHER_ALGORITHM, DEFAULT_ITERATIONS, FORMAT_VERSION, IV_BYTES, KDF_ALGORITHM, KEY_BITS, MAX_ITERATIONS (+38 more)

### Community 1 - "notes.ts"
Cohesion: 0.06
Nodes (21): AppDeps, BODY_LIMIT, buildApp(), ApiError, CreatedNote, Logger, MAX_CIPHERTEXT_BYTES, NotesService (+13 more)

### Community 2 - "db"
Cohesion: 0.09
Nodes (25): environment, healthcheck, image, ports, volumes, MINIO_DEFAULT_BUCKETS, MINIO_ROOT_PASSWORD, MINIO_ROOT_USER (+17 more)

### Community 3 - "package.json"
Cohesion: 0.10
Nodes (22): description, devDependencies, tsx@^4.23.15, @types/node@^22.20.5, typescript@^5.9.3, vitest@^4.1.12, engines, node (+14 more)

### Community 4 - "steps"
Cohesion: 0.14
Nodes (13): runs-on, steps, jobs, check, name, on, pull_request, push (+5 more)

### Community 5 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution, noImplicitOverride, noUncheckedIndexedAccess (+5 more)

### Community 6 - "kdf.test.ts"
Cohesion: 0.24
Nodes (6): containsBytes(), hex(), toHex(), utf8(), RFC-7914, vitest

### Community 7 - "crypto/package.json"
Cohesion: 0.29
Nodes (6): description, exports, name, private, type, version

### Community 8 - "tsconfig.json"
Cohesion: 0.18
Nodes (9): compilerOptions, types, extends, include, compilerOptions, types, extends, include (+1 more)

### Community 9 - "Crypto Notepad"
Cohesion: 0.25
Nodes (7): API (IF2 INotesApi), Crypto Notepad, Запуск, План, Структура (компоненты из ЛР7), Тесты, Формат зашифрованного пакета (v1)

### Community 10 - "Crypto Notepad"
Cohesion: 0.40
Nodes (4): Crypto Notepad, graphify, Правила, Скиллы проекта

### Community 11 - "PostgresMetadataStore"
Cohesion: 0.11
Nodes (8): MemoryBlobStore, MemoryMetadataStore, MIGRATIONS, NoteRow, PostgresMetadataStore, IMetadataStore, NoteMetadata, setup()

### Community 12 - "server.ts"
Cohesion: 0.13
Nodes (8): Config, envFile, loadConfig(), app, blobs, config, metadata, S3BlobStore

### Community 13 - "api/package.json"
Cohesion: 0.14
Nodes (17): dependencies, @aws-sdk/client-s3@^3.1174.0, @cn/crypto@*, fastify@^5.12.8, postgres@^3.4.9, description, name, private (+9 more)

## Knowledge Gaps
- **3 isolated node(s):** `RFC-7914`, `RFC-4648`, `RFC-7914`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 133 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `kdf.test.ts` to `note.ts`, `notes.ts`, `package.json`?**
  _High betweenness centrality (0.123) - this node is a cross-community bridge._
- **What connects `RFC-7914`, `RFC-4648`, `RFC-7914` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `note.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11688311688311688 - nodes in this community are weakly interconnected._
- **Why does `S3BlobStore` connect `server.ts` to `notes.ts`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Should `notes.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.061170212765957445 - nodes in this community are weakly interconnected._
- **Why does `PostgresMetadataStore` connect `PostgresMetadataStore` to `notes.ts`, `server.ts`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Should `db` be split into smaller, more focused modules?**
  _Cohesion score 0.08615384615384615 - nodes in this community are weakly interconnected._