-- ── Meal Plan feature ─────────────────────────────────────────────────────────
-- Tables: meals, meal_ingredients, meal_plan_slots
-- Permissions: reuses shopping_access (no new column needed)
-- Run in Supabase SQL editor.

-- 1. Meal library (one row per meal per household)
CREATE TABLE IF NOT EXISTS meals (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Ingredients per meal (names only, no quantities)
CREATE TABLE IF NOT EXISTS meal_ingredients (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id uuid NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  name    text NOT NULL
);

-- 3. Weekly plan grid slots
--    week_start is always the Monday of the planned week (YYYY-MM-DD)
--    day_of_week: 0=Mon … 6=Sun
--    slot: breakfast | lunch | dinner
CREATE TABLE IF NOT EXISTS meal_plan_slots (
  id           uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid     NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  week_start   date     NOT NULL,
  day_of_week  smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  slot         text     NOT NULL CHECK (slot IN ('breakfast', 'lunch', 'dinner')),
  meal_id      uuid     REFERENCES meals(id) ON DELETE SET NULL,
  UNIQUE (account_id, week_start, day_of_week, slot)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE meals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plan_slots  ENABLE ROW LEVEL SECURITY;

-- meals: members with any shopping_access can read; write requires shopping_access = 'write'
CREATE POLICY "meals_select" ON meals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meals.account_id
        AND am.user_id    = auth.uid()
        AND am.shopping_access <> 'none'
    )
  );

CREATE POLICY "meals_insert" ON meals
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meals.account_id
        AND am.user_id    = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );

CREATE POLICY "meals_update" ON meals
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meals.account_id
        AND am.user_id    = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );

CREATE POLICY "meals_delete" ON meals
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meals.account_id
        AND am.user_id    = auth.uid()
        AND am.role       = 'admin'
    )
  );

-- meal_ingredients: inherit access via parent meal → account
CREATE POLICY "meal_ingredients_select" ON meal_ingredients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM meals m
      JOIN account_members am ON am.account_id = m.account_id
      WHERE m.id         = meal_ingredients.meal_id
        AND am.user_id   = auth.uid()
        AND am.shopping_access <> 'none'
    )
  );

CREATE POLICY "meal_ingredients_insert" ON meal_ingredients
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM meals m
      JOIN account_members am ON am.account_id = m.account_id
      WHERE m.id         = meal_ingredients.meal_id
        AND am.user_id   = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );

CREATE POLICY "meal_ingredients_update" ON meal_ingredients
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM meals m
      JOIN account_members am ON am.account_id = m.account_id
      WHERE m.id         = meal_ingredients.meal_id
        AND am.user_id   = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );

CREATE POLICY "meal_ingredients_delete" ON meal_ingredients
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM meals m
      JOIN account_members am ON am.account_id = m.account_id
      WHERE m.id         = meal_ingredients.meal_id
        AND am.user_id   = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );

-- meal_plan_slots: same access pattern as meals
CREATE POLICY "meal_plan_slots_select" ON meal_plan_slots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meal_plan_slots.account_id
        AND am.user_id    = auth.uid()
        AND am.shopping_access <> 'none'
    )
  );

CREATE POLICY "meal_plan_slots_insert" ON meal_plan_slots
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meal_plan_slots.account_id
        AND am.user_id    = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );

CREATE POLICY "meal_plan_slots_update" ON meal_plan_slots
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meal_plan_slots.account_id
        AND am.user_id    = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );

CREATE POLICY "meal_plan_slots_delete" ON meal_plan_slots
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meal_plan_slots.account_id
        AND am.user_id    = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );
