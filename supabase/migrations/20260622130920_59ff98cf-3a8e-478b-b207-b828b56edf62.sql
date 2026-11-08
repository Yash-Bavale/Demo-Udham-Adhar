
-- Add manager + executive to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'executive';

-- Profile fields used for employees
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
