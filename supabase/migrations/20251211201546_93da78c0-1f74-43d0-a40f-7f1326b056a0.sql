-- Create geo_configuration table for database-driven geo settings
CREATE TABLE public.geo_configuration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_type TEXT NOT NULL, -- 'non_ncr_keyword' or 'ncr_bounds'
  config_key TEXT NOT NULL,  -- keyword or bound name (minLat, maxLat, minLng, maxLng)
  config_value TEXT,         -- for bounds: numeric string, for keywords: null
  notes TEXT,                -- optional description
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(config_type, config_key)
);

-- Enable RLS
ALTER TABLE public.geo_configuration ENABLE ROW LEVEL SECURITY;

-- Admins can manage, everyone can read
CREATE POLICY "Admins can manage geo configuration"
  ON public.geo_configuration FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Geo configuration is viewable by everyone"
  ON public.geo_configuration FOR SELECT
  USING (true);

-- Seed NCR bounds
INSERT INTO public.geo_configuration (config_type, config_key, config_value, notes) VALUES
  ('ncr_bounds', 'minLat', '14.35', 'Southern boundary (Muntinlupa)'),
  ('ncr_bounds', 'maxLat', '14.80', 'Northern boundary (Valenzuela/Caloocan)'),
  ('ncr_bounds', 'minLng', '120.85', 'Western boundary (Manila Bay coast)'),
  ('ncr_bounds', 'maxLng', '121.15', 'Eastern boundary (Pasig/Marikina border)');

-- Seed Non-NCR province keywords
INSERT INTO public.geo_configuration (config_type, config_key, notes) VALUES
  -- Pampanga
  ('non_ncr_keyword', 'pampanga', 'Pampanga province'),
  ('non_ncr_keyword', 'angeles city', 'Pampanga'),
  ('non_ncr_keyword', 'san fernando pampanga', 'Pampanga'),
  ('non_ncr_keyword', 'clark', 'Clark Freeport Zone'),
  ('non_ncr_keyword', 'clark freeport', 'Clark Freeport Zone'),
  -- Bulacan
  ('non_ncr_keyword', 'bulacan', 'Bulacan province'),
  ('non_ncr_keyword', 'malolos', 'Bulacan'),
  ('non_ncr_keyword', 'meycauayan bulacan', 'Bulacan'),
  ('non_ncr_keyword', 'sta. maria bulacan', 'Bulacan'),
  ('non_ncr_keyword', 'san jose del monte', 'Bulacan'),
  -- Cavite
  ('non_ncr_keyword', 'cavite', 'Cavite province'),
  ('non_ncr_keyword', 'tagaytay', 'Cavite'),
  ('non_ncr_keyword', 'silang cavite', 'Cavite'),
  ('non_ncr_keyword', 'dasmarinas cavite', 'Cavite'),
  ('non_ncr_keyword', 'imus cavite', 'Cavite'),
  ('non_ncr_keyword', 'general trias', 'Cavite'),
  ('non_ncr_keyword', 'kawit cavite', 'Cavite'),
  ('non_ncr_keyword', 'rosario cavite', 'Cavite'),
  -- Laguna
  ('non_ncr_keyword', 'laguna', 'Laguna province'),
  ('non_ncr_keyword', 'los banos', 'Laguna'),
  ('non_ncr_keyword', 'los baños', 'Laguna'),
  ('non_ncr_keyword', 'san pablo laguna', 'Laguna'),
  ('non_ncr_keyword', 'sta. rosa laguna', 'Laguna'),
  ('non_ncr_keyword', 'sta. rosa', 'Laguna - Santa Rosa'),
  ('non_ncr_keyword', 'santa rosa laguna', 'Laguna'),
  ('non_ncr_keyword', 'calamba laguna', 'Laguna'),
  ('non_ncr_keyword', 'binan laguna', 'Laguna'),
  ('non_ncr_keyword', 'nuvali', 'Laguna - Ayala development'),
  ('non_ncr_keyword', 'solenad', 'Laguna - Ayala Malls'),
  ('non_ncr_keyword', 'ayala malls solenad', 'Laguna'),
  ('non_ncr_keyword', 'solenad nuvali', 'Laguna'),
  -- Batangas
  ('non_ncr_keyword', 'batangas', 'Batangas province'),
  ('non_ncr_keyword', 'lipa batangas', 'Batangas'),
  ('non_ncr_keyword', 'tanauan batangas', 'Batangas'),
  ('non_ncr_keyword', 'batangas city', 'Batangas'),
  -- Rizal
  ('non_ncr_keyword', 'rizal province', 'Rizal province (not Rizal Park)'),
  ('non_ncr_keyword', 'antipolo rizal', 'Rizal'),
  ('non_ncr_keyword', 'taytay rizal', 'Rizal'),
  ('non_ncr_keyword', 'cainta rizal', 'Rizal'),
  ('non_ncr_keyword', 'binangonan rizal', 'Rizal'),
  ('non_ncr_keyword', 'tanay rizal', 'Rizal'),
  ('non_ncr_keyword', 'angono rizal', 'Rizal'),
  ('non_ncr_keyword', 'morong rizal', 'Rizal'),
  -- Other provinces
  ('non_ncr_keyword', 'nueva ecija', 'Nueva Ecija province'),
  ('non_ncr_keyword', 'tarlac', 'Tarlac province'),
  ('non_ncr_keyword', 'zambales', 'Zambales province'),
  ('non_ncr_keyword', 'pangasinan', 'Pangasinan province'),
  ('non_ncr_keyword', 'quezon province', 'Quezon province (not QC)'),
  -- Explicit markers
  ('non_ncr_keyword', 'outside metro manila', 'Explicit non-NCR marker'),
  ('non_ncr_keyword', 'outside ncr', 'Explicit non-NCR marker'),
  ('non_ncr_keyword', 'provincial', 'Explicit non-NCR marker');

-- Create trigger for updated_at
CREATE TRIGGER update_geo_configuration_updated_at
  BEFORE UPDATE ON public.geo_configuration
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();