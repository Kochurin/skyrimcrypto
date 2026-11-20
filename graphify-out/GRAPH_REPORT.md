# Graph Report - crypto-notepad  (2026-11-21)

## Corpus Check
- 21 files · ~4,057 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 3, .example 1)

## Summary
- 166 nodes · 302 edges · 11 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- note.ts
- note.test.ts
- db
- package.json
- steps
- compilerOptions
- kdf.test.ts
- crypto/package.json
- tsconfig.json
- Crypto Notepad
- Crypto Notepad

## God Nodes (most connected - your core abstractions)
1. `CryptoError` - 16 edges
2. `compilerOptions` - 13 edges
3. `encryptNote()` - 11 edges
4. `deriveKey()` - 9 edges
5. `decryptNote()` - 9 edges
6. `getSubtle()` - 9 edges
7. `toBase64Url()` - 7 edges
8. `utf8Encode()` - 7 edges
9. `EncryptedPackage` - 7 edges
10. `decodePackage()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `bytes()` --calls--> `fromBase64Url()`  [EXTRACTED]
  packages/crypto/src/package.ts → packages/crypto/src/encoding.ts
- `encryptNote()` --calls--> `utf8Encode()`  [EXTRACTED]
  packages/crypto/src/note.ts → packages/crypto/src/encoding.ts
- `decryptNote()` --calls--> `utf8Decode()`  [EXTRACTED]
  packages/crypto/src/note.ts → packages/crypto/src/encoding.ts
- `checkIterations()` --calls--> `CryptoError`  [EXTRACTED]
  packages/crypto/src/kdf.ts → packages/crypto/src/errors.ts
- `decryptNote()` --calls--> `CryptoError`  [EXTRACTED]
  packages/crypto/src/note.ts → packages/crypto/src/errors.ts

## Import Cycles
- None detected.

## Communities (11 total, 0 thin omitted)

### Community 0 - "note.ts"
Cohesion: 0.15
Nodes (29): CIPHER_ALGORITHM, DEFAULT_ITERATIONS, FORMAT_VERSION, IV_BYTES, KDF_ALGORITHM, KEY_BITS, MAX_ITERATIONS, MAX_PLAINTEXT_BYTES (+21 more)

### Community 1 - "note.test.ts"
Cohesion: 0.18
Nodes (20): RFC-4648, decoder, encoder, fromBase64Url(), toBase64Url(), utf8Decode(), CryptoError, CryptoErrorCode (+12 more)

### Community 2 - "db"
Cohesion: 0.08
Nodes (24): environment, healthcheck, image, ports, volumes, MINIO_ROOT_PASSWORD, MINIO_ROOT_USER, POSTGRES_DB (+16 more)

### Community 3 - "package.json"
Cohesion: 0.12
Nodes (18): description, devDependencies, @types/node@^22.20.5, typescript@^5.9.3, vitest@^4.1.12, engines, node, name (+10 more)

### Community 4 - "steps"
Cohesion: 0.14
Nodes (13): runs-on, steps, jobs, check, name, on, pull_request, push (+5 more)

### Community 5 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution, noImplicitOverride, noUncheckedIndexedAccess (+5 more)

### Community 6 - "kdf.test.ts"
Cohesion: 0.27
Nodes (6): containsBytes(), hex(), toHex(), utf8(), RFC-7914, vitest

### Community 7 - "crypto/package.json"
Cohesion: 0.29
Nodes (6): description, exports, name, private, type, version

### Community 8 - "tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.base.json

### Community 9 - "Crypto Notepad"
Cohesion: 0.33
Nodes (5): Crypto Notepad, Команды, План, Структура (компоненты из ЛР7), Формат зашифрованного пакета (v1)

### Community 10 - "Crypto Notepad"
Cohesion: 0.50
Nodes (3): Crypto Notepad, Правила, Скиллы проекта

## Knowledge Gaps
- **4 isolated node(s):** `RFC-4648`, `RFC-7914`, `RFC-7914`, `../../tsconfig.base.json`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 77 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `kdf.test.ts` to `note.test.ts`, `package.json`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **What connects `RFC-4648`, `RFC-7914`, `RFC-7914` to the rest of the system?**
  _4 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `db` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.11695906432748537 - nodes in this community are weakly interconnected._
- **Should `steps` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._