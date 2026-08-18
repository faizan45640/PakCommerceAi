# Phase 3 — Access control

## Gate 3 — Red

The RLS tests were red along with everything else in the phase-2 red run.

## Gate 5 — Green + aligned

**A real defect was found here, by the tests, and it is the reason this phase exists
separately.**

The first run against a correctly initialised database gave 19/27, with all 8 RLS tests
failing identically:

```
error: permission denied for table products
error: permission denied for table product_variants
```

The migrations enabled RLS and created policies but never granted table privileges. A policy
decides *which rows* a role may touch; a grant decides whether the role may touch the table
**at all**. Without the grant, PostgREST would have returned `permission denied` for every
seller request and the carefully written policies would never have run.

Tables created through the Supabase dashboard are granted automatically, which is why the
three pre-existing tables work and nothing had surfaced this before. Tables created by a
migration are not.

Fix: explicit grants, in the same migration as the policies — they are the same
responsibility.

```sql
grant select, insert, update, delete on public.products to authenticated, service_role;
grant select, insert, update, delete on public.product_variants to authenticated, service_role;
```

The same omission applied to the baseline tables, so grants were added there too — otherwise
a fresh `supabase db reset` produces a database whose tables the API cannot read, differing
from the hosted one.

`anon` is granted nothing. That is a deliberate second barrier: a logged-out request is
denied at the privilege layer before RLS is consulted. The test was strengthened from
"returns no rows" to "is denied", which is the stronger property.

After the fix: **27/27 green.**

## Gate 7 — Scan

The eight isolation tests check the boundary from outside — what seller A can actually do to
seller B's rows — rather than inspecting policy definitions. A policy that exists but does
not work would pass the latter and fail these; the grant bug is exactly that case, and these
tests caught it.

Coverage of the commands: select, insert, update (including `with check`, so a seller cannot
reassign a row to someone else), delete, and the anonymous role.
