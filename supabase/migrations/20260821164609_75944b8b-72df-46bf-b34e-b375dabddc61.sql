ALTER TABLE public.websites
  ADD COLUMN IF NOT EXISTS sanity_project_id text,
  ADD COLUMN IF NOT EXISTS sanity_dataset text;

UPDATE public.websites SET sanity_project_id = '519jq1ws', sanity_dataset = 'production' WHERE domain = 'udyamadhar.in';
UPDATE public.websites SET sanity_project_id = '519jq1ws', sanity_dataset = 'udyamregistrations' WHERE domain = 'udyamregistrations.in';