# SkyrimCrypto

Учебный проект: реализация системы из лабораторных 1–7 (Кочурин, ВИ42). Описание и план — в `README.md`.

## Правила

- Zero-Knowledge: открытый текст, мастер-пароль и ключ никогда не уходят на сервер, не пишутся в логи и в localStorage.
- Своей криптографии не писать: только `crypto.subtle`. Любое изменение параметров — новая версия формата пакета.
- Криптомодуль `packages/crypto` не зависит от React и сервера; изменения в нём — только с зелёными тестами (`npm run check`).
- На фронтенде не использовать `innerHTML` / `dangerouslySetInnerHTML` (XSS обходит шифрование).
- Обозначения как в лабах: компоненты K1–K4, интерфейсы IF1–IF4, требования FR-xx / NFR-xx, сценарии US-0x.

## Скиллы проекта

- `run` — запустить приложение и проверить изменения в браузере (с этапа 3).
- `code-review` — проверка изменений перед коммитом.
- `security-review` — проверка безопасности (обязательно на этапе 5).
- `graphify` — вопросы по коду: `graphify query "<вопрос>"`, после правок `graphify update .`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
