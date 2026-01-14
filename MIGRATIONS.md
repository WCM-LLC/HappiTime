# Migrations

Migrations live in `supabase/migrations/` and are applied in timestamp order.

## Local
Start Supabase locally (Docker required):
```powershell
npm run supabase:start
```

Apply migrations + seed:
```powershell
npm run supabase:reset
```

## Remote
Link your Supabase project (one-time):
```powershell
npm exec supabase link --project-ref <PROJECT_REF>
```

Push migrations:
```powershell
npm run supabase:push
```

## Rollback guidance
Supabase migrations are forward-only by default.
To roll back safely:
1) Create a new migration that reverts the specific change.
2) Deploy the rollback migration.
3) For destructive changes, prefer a staged approach (add → backfill → switch reads → remove).

