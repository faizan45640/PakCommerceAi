# API contracts

Transport-level response shapes shared by `apps/api` (producer) and `apps/web`
(consumer). Domain schemas live in `products/` and `workspaces/`; this module
wraps them, it never redefines them.

## Response envelopes

Every success response is wrapped:

- Single resource — `{ data }`, validated by `apiDataResponseSchema(domainSchema)`
- List — `{ data: [...], meta: { page, pageSize, total } }`, validated by
  `apiListResponseSchema(itemSchema)`

Both are factory functions so the domain schema stays the single source of truth.

## Errors

Every failure response uses `apiErrorSchema`:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request body is invalid.",
    "details": { "name": ["Name is required."] }
  }
}
```

`code` must be one of `apiErrorCodeValues`. `details` maps field paths to human
readable messages and is optional.

## Versioning

Pinned by `apiContractVersion`. Bump when envelope or error shape changes.
