-- Phase C: NIC 2008 search infrastructure + 1293 sub-class seed
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_nic_code_prefix ON public.nic_codes (code text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_nic_desc_lower_trgm ON public.nic_codes USING gin (lower(description) gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_nic_codes(
  q text DEFAULT '',
  activity text DEFAULT NULL,
  limit_n int DEFAULT 25
) RETURNS TABLE (
  code text, description text, section text, division text,
  group_code text, class_code text, activity_type text, rank real
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT n.code, n.description, n.section, n.division, n.group_code, n.class_code, n.activity_type,
    CASE
      WHEN q = '' THEN 0::real
      WHEN n.code LIKE q || '%' THEN 1.0::real
      ELSE similarity(lower(n.description), lower(q))
    END AS rank
  FROM public.nic_codes n
  WHERE (activity IS NULL OR n.activity_type = activity)
    AND (
      q = ''
      OR n.code LIKE q || '%'
      OR lower(n.description) ILIKE '%' || lower(q) || '%'
    )
  ORDER BY rank DESC, n.code ASC
  LIMIT GREATEST(1, LEAST(limit_n, 100));
$$;

GRANT EXECUTE ON FUNCTION public.search_nic_codes(text, text, int) TO anon, authenticated, service_role;