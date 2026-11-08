-- ============================================================================
-- Support Ticket Folders and Starred Organization
-- Safe, reversible migration for Gmail-style organization
-- ============================================================================

-- 1. Custom folders table
CREATE TABLE IF NOT EXISTS public.support_ticket_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT DEFAULT 'slate',
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_folders_user ON public.support_ticket_folders(user_id);

-- 2. Ticket folder mapping table (moving/organizing tickets into folders)
CREATE TABLE IF NOT EXISTS public.support_ticket_folder_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES public.support_ticket_folders(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ticket_folder_item UNIQUE (folder_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_folder_items_ticket ON public.support_ticket_folder_items(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_folder_items_folder ON public.support_ticket_folder_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_ticket_folder_items_user ON public.support_ticket_folder_items(user_id);

-- 3. Starred tickets table
CREATE TABLE IF NOT EXISTS public.support_ticket_stars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ticket_star_user UNIQUE (ticket_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_stars_user ON public.support_ticket_stars(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_stars_ticket ON public.support_ticket_stars(ticket_id);

-- Grants
GRANT ALL ON public.support_ticket_folders TO authenticated, service_role, anon;
GRANT ALL ON public.support_ticket_folder_items TO authenticated, service_role, anon;
GRANT ALL ON public.support_ticket_stars TO authenticated, service_role, anon;

-- Enable RLS
ALTER TABLE public.support_ticket_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_folder_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_stars ENABLE ROW LEVEL SECURITY;

-- Permissive staff policies
DO $$ BEGIN
  CREATE POLICY "Staff can view their own and shared folders"
    ON public.support_ticket_folders FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR is_shared = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Staff can manage their own folders"
    ON public.support_ticket_folders FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Staff can view folder items"
    ON public.support_ticket_folder_items FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Staff can manage folder items"
    ON public.support_ticket_folder_items FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Staff can manage their stars"
    ON public.support_ticket_stars FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
