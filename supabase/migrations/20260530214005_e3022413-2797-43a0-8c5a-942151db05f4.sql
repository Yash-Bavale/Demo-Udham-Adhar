-- Roles
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Auto-promote the first signup to admin
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_bootstrap_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.bootstrap_first_admin();

-- SEO pages
CREATE TABLE public.seo_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.seo_pages TO anon, authenticated;
GRANT ALL ON public.seo_pages TO service_role;

ALTER TABLE public.seo_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read enabled seo pages"
ON public.seo_pages FOR SELECT
TO anon, authenticated
USING (enabled = true OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER seo_pages_touch_updated_at
BEFORE UPDATE ON public.seo_pages
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_seo_pages_sort ON public.seo_pages (sort_order, slug);

-- Seed
INSERT INTO public.seo_pages (slug, label, enabled, sort_order) VALUES
('aadhaar-udyam', 'Aadhaar Udyam', true, 0),
('aadhar-udyam', 'Aadhar Udyam', true, 1),
('aadhar-udyam-certificate', 'Aadhar Udyam Certificate', true, 2),
('aadhar-udyam-download', 'Aadhar Udyam Download', true, 3),
('aadhar-udyam-print', 'Aadhar Udyam Print', true, 4),
('aadhar-udyam-registration', 'Aadhar Udyam Registration', true, 5),
('aadhar-udyog', 'Aadhar Udyog', true, 6),
('aadhar-udyog-registration', 'Aadhar Udyog Registration', true, 7),
('download-msme-certificate', 'Download Msme Certificate', true, 8),
('download-udyam', 'Download Udyam', true, 9),
('download-udyam-aadhar', 'Download Udyam Aadhar', true, 10),
('download-udyam-certificate-online', 'Download Udyam Certificate Online', true, 11),
('free-msme-registration-certificate-download', 'Free Msme Registration Certificate Download', true, 12),
('https-udyamregistration-gov-in', 'Https Udyamregistration Gov In', true, 13),
('ms-me-certificate', 'Ms Me Certificate', true, 14),
('msme-apply-online', 'Msme Apply Online', true, 15),
('msme-cer', 'Msme Cer', true, 16),
('msme-certificate', 'Msme Certificate', true, 17),
('msme-certificate-download', 'Msme Certificate Download', true, 18),
('msme-certificate-print', 'Msme Certificate Print', true, 19),
('msme-certificate-registration', 'Msme Certificate Registration', true, 20),
('msme-certificate-update', 'Msme Certificate Update', true, 21),
('msme-online-registration', 'Msme Online Registration', true, 22),
('msme-print-certificate', 'Msme Print Certificate', true, 23),
('msme-print-udyam-certificate', 'Msme Print Udyam Certificate', true, 24),
('msme-registration-certificate-download', 'Msme Registration Certificate Download', true, 25),
('msme-registration-charges', 'Msme Registration Charges', true, 26),
('msme-registration-fee', 'Msme Registration Fee', true, 27),
('msme-registration-free', 'Msme Registration Free', true, 28),
('msme-registration-login', 'Msme Registration Login', true, 29),
('msme-registration-portal', 'Msme Registration Portal', true, 30),
('msme-registration-process', 'Msme Registration Process', true, 31),
('msme-udyam-certificate-download', 'Msme Udyam Certificate Download', true, 32),
('msme-udyam-download', 'Msme Udyam Download', true, 33),
('msme-udyam-registration', 'Msme Udyam Registration', true, 34),
('msme-udyog-aadhar', 'Msme Udyog Aadhar', true, 35),
('msme-updation', 'Msme Updation', true, 36),
('print-msme-certificate', 'Print Msme Certificate', true, 37),
('print-msme-udyam-certificate', 'Print Msme Udyam Certificate', true, 38),
('print-udyam', 'Print Udyam', true, 39),
('print-udyam-certificate', 'Print Udyam Certificate', true, 40),
('print-udyam-certificate-download', 'Print Udyam Certificate Download', true, 41),
('register-for-msme', 'Register For Msme', true, 42),
('register-msme', 'Register Msme', true, 43),
('udham-aadhar-download', 'Udham Aadhar Download', true, 44),
('udhar-aadhar-registration', 'Udhar Aadhar Registration', true, 45),
('udhayam-aadhar-download', 'Udhayam Aadhar Download', true, 46),
('udyam', 'Udyam', true, 47),
('udyam-aadhaar', 'Udyam Aadhaar', true, 48),
('udyam-aadhaar-download-pdf', 'Udyam Aadhaar Download Pdf', true, 49),
('udyam-aadhaar-login', 'Udyam Aadhaar Login', true, 50),
('udyam-aadhaar-registration', 'Udyam Aadhaar Registration', true, 51),
('udyam-aadhaar-status', 'Udyam Aadhaar Status', true, 52),
('udyam-aadhaar-verify', 'Udyam Aadhaar Verify', true, 53),
('udyam-aadhar', 'Udyam Aadhar', true, 54),
('udyam-aadhar-registration', 'Udyam Aadhar Registration', true, 55),
('udyam-adhaar', 'Udyam Adhaar', true, 56),
('udyam-adhar-2', 'Udyam Adhar 2', true, 57),
('udyam-adhar-download', 'Udyam Adhar Download', true, 58),
('udyam-application', 'Udyam Application', true, 59),
('udyam-apply', 'Udyam Apply', true, 60),
('udyam-card', 'Udyam Card', true, 61),
('udyam-card-download', 'Udyam Card Download', true, 62),
('udyam-certificate', 'Udyam Certificate', true, 63),
('udyam-certificate-apply', 'Udyam Certificate Apply', true, 64),
('udyam-certificate-apply-online', 'Udyam Certificate Apply Online', true, 65),
('udyam-certificate-download', 'Udyam Certificate Download', true, 66),
('udyam-certificate-download-pdf', 'Udyam Certificate Download Pdf', true, 67),
('udyam-certificate-print', 'Udyam Certificate Print', true, 68),
('udyam-certificate-registration', 'Udyam Certificate Registration', true, 69),
('udyam-certificate-reprint', 'Udyam Certificate Reprint', true, 70),
('udyam-certificate-status', 'Udyam Certificate Status', true, 71),
('udyam-certificate-update', 'Udyam Certificate Update', true, 72),
('udyam-download', 'Udyam Download', true, 73),
('udyam-download-certificate', 'Udyam Download Certificate', true, 74),
('udyam-download-online', 'Udyam Download Online', true, 75),
('udyam-edit', 'Udyam Edit', true, 76),
('udyam-msme', 'Udyam Msme', true, 77),
('udyam-msme-certificate', 'Udyam Msme Certificate', true, 78),
('udyam-msme-certificate-download', 'Udyam Msme Certificate Download', true, 79),
('udyam-msme-registration', 'Udyam Msme Registration', true, 80),
('udyam-new-registration', 'Udyam New Registration', true, 81),
('udyam-number', 'Udyam Number', true, 82),
('udyam-online-registration', 'Udyam Online Registration', true, 83),
('udyam-pan-registration', 'Udyam Pan Registration', true, 84),
('udyam-portal', 'Udyam Portal', true, 85),
('udyam-print', 'Udyam Print', true, 86),
('udyam-print-certificate', 'Udyam Print Certificate', true, 87),
('udyam-print-download', 'Udyam Print Download', true, 88),
('udyam-print-with-annexure', 'Udyam Print With Annexure', true, 89),
('udyam-reg-certificate', 'Udyam Reg Certificate', true, 90),
('udyam-register', 'Udyam Register', true, 91),
('udyam-register-certificate-download', 'Udyam Register Certificate Download', true, 92),
('udyam-register-print', 'Udyam Register Print', true, 93),
('udyam-registration-certificate-download', 'Udyam Registration Certificate Download', true, 94),
('udyam-registration-check', 'Udyam Registration Check', true, 95),
('udyam-registration-download', 'Udyam Registration Download', true, 96),
('udyam-registration-form', 'Udyam Registration Form', true, 97),
('udyam-registration-number', 'Udyam Registration Number', true, 98),
('udyam-registration-number-verify', 'Udyam Registration Number Verify', true, 99),
('udyam-registration-online', 'Udyam Registration Online', true, 100),
('udyam-registration-portal', 'Udyam Registration Portal', true, 101),
('udyam-registration-update', 'Udyam Registration Update', true, 102),
('udyam-regn', 'Udyam Regn', true, 103),
('udyam-regn-certificate', 'Udyam Regn Certificate', true, 104),
('udyam-reprint', 'Udyam Reprint', true, 105),
('udyam-update', 'Udyam Update', true, 106),
('udyam-update-online', 'Udyam Update Online', true, 107),
('udyamregistration', 'Udyamregistration', true, 108),
('udyamregistration-gov-in', 'Udyamregistration Gov In', true, 109),
('udyog-aadhaar', 'Udyog Aadhaar', true, 110),
('udyog-aadhaar-download', 'Udyog Aadhaar Download', true, 111),
('udyog-aadhaar-government-in', 'Udyog Aadhaar Government In', true, 112),
('udyog-aadhaar-govin', 'Udyog Aadhaar Govin', true, 113),
('udyog-aadhaar-no', 'Udyog Aadhaar No', true, 114),
('udyog-aadhaar-number', 'Udyog Aadhaar Number', true, 115),
('udyog-aadhaar-register', 'Udyog Aadhaar Register', true, 116),
('udyog-aadhaar-to-udyam-migration', 'Udyog Aadhaar To Udyam Migration', true, 117),
('udyog-aadhaar-update', 'Udyog Aadhaar Update', true, 118),
('udyog-aadhar', 'Udyog Aadhar', true, 119),
('udyog-aadhar-card', 'Udyog Aadhar Card', true, 120),
('udyog-aadhar-certificate', 'Udyog Aadhar Certificate', true, 121),
('udyog-aadhar-certificate-download', 'Udyog Aadhar Certificate Download', true, 122),
('udyog-aadhar-download', 'Udyog Aadhar Download', true, 123),
('udyog-aadhar-free-registration', 'Udyog Aadhar Free Registration', true, 124),
('udyog-aadhar-registration', 'Udyog Aadhar Registration', true, 125),
('udyog-aadhar-registration-2', 'Udyog Aadhar Registration 2', true, 126),
('udyog-aadhar-registration-online', 'Udyog Aadhar Registration Online', true, 127),
('udyog-aadhar-update', 'Udyog Aadhar Update', true, 128),
('www-udyamregistration', 'Www Udyamregistration', true, 129),
('www-udyamregistration-gov-in', 'Www Udyamregistration Gov In', true, 130)
ON CONFLICT (slug) DO NOTHING;