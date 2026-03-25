-- Honorarios mensuales por proyecto (EUR, opcional)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC(12, 2) DEFAULT NULL
  CHECK (monthly_fee IS NULL OR monthly_fee >= 0);

COMMENT ON COLUMN public.projects.monthly_fee IS 'Honorarios mensuales acordados con el cliente (EUR)';
