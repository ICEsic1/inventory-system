# Fix Plan

## Issues Identified
1. Table name mismatch: code uses `inventory` but schema has `items`
2. Wrong import path in `app/page.tsx`
3. Two inconsistent supabase client implementations
4. Missing `.env.local`

## Steps
- [x] Step 1: Fix `app/page.tsx` import path
- [x] Step 2: Fix table name in `app/actions/inventory-actions.ts` (inventory → items)
- [x] Step 3: Fix table name in `app/lib/inventory-dashboard.tsx` (inventory → items)
- [x] Step 4: Consolidate supabase clients
- [ ] Step 5: Create `.env.local` template (skipped - user will handle)
- [x] Step 6: Test build
