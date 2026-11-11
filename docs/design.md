# Architecture

Agent Usage is a local React 19 / Vite 7 frontend with a Node HTTP service and ccusage 20.0.48. The dashboard provides Chinese and English interfaces, all installed ccusage agent namespaces, shared date/source filters, daily/weekly/monthly grouping, cache metrics, estimated costs, and CSV export.

## Collection

`server/index.mjs` executes the installed ccusage CLI through Node, without shell interpolation. `ccusage --help` discovers supported source commands. One `daily --by-agent --json --offline --timezone Asia/Hong_Kong` report supplies all agents each cycle.

`server/collector.mjs` normalizes only the per-agent rows, never also the aggregate row. It retains prior successful data on failure, coalesces concurrent requests, and schedules the next collection 20 minutes after completion. The browser can close without stopping collection. Manual collection restarts the deadline. Snapshot version 2 includes the agent catalog and supports loading version 1 history.

When a warned report omits a previously recorded source, its prior rows are marked stale. A clean empty report confirms that the history is empty. Errors use machine codes rather than passing CLI stderr or private paths to the browser. Discovery failures use the existing catalog and report a warning; newly detected source IDs can still be displayed.

## Domain and presentation

`src/domain/agents.mjs` owns namespace validation, friendly names, and stable colors. Unknown future sources use their namespace and a deterministic color. `src/domain/usage.mjs` normalizes separate fresh/cache/output categories and legacy inclusive Codex cache input, preserves reported totals, retains missing prices, and aggregates filtered rows. Dynamic bucket maps support any agent ID.

`src/i18n/messages.mjs` contains matching Chinese / English dictionaries. `I18nProvider` stores the manual language choice, updates document language/title, and provides locale formatting. Switching language does not recreate filter, tab, or chart state. CSV export uses the same dictionary.

All sections derive from one `buildView` result. Agent selection includes supported sources without history; chart legends include only agents recorded within the selected range. Cache hit rate is cache reads divided by total input, excluding writes from hits. Costs come directly from ccusage; missing costs never imply free usage.

## Local service

The server binds to loopback, checks Host/Origin, and serves a static whitelist. Only aggregate snapshots are sent to the frontend. Snapshots are atomically written to the Git-ignored `.data/` directory. Authentication files and session content are never served.

The frontend polls cached data every 15 seconds while visible and when it regains visibility. Collection is owned by the server, not polling. The initial date range is the current month; timezone is Asia/Hong_Kong and weeks start on Monday.
