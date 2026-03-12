## 2026-03-12 Lazy config loading refactor
- `scripts/install-core.js` must avoid module-load side effects; caching with `getConfig()` preserves behavior while deferring config reads until first use.
- Returning `configError` on the `loadConfig()` result removes mutable cross-call singleton state and keeps parse status tied to the specific load attempt.
