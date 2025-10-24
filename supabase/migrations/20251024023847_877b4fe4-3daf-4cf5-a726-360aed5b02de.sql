-- Create location_templates table
CREATE TABLE IF NOT EXISTS public.location_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  template_name text NOT NULL,
  venue_name text NOT NULL,
  street_address text,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  usage_count integer NOT NULL DEFAULT 0,
  notes text
);

-- Enable RLS
ALTER TABLE public.location_templates ENABLE ROW LEVEL SECURITY;

-- Admins can manage location templates
CREATE POLICY "Admins can manage location templates"
ON public.location_templates
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster lookups
CREATE INDEX idx_location_templates_venue ON public.location_templates(venue_name);

-- Create trigger for updated_at
CREATE TRIGGER update_location_templates_updated_at
BEFORE UPDATE ON public.location_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create event_edit_history table for undo functionality
CREATE TABLE IF NOT EXISTS public.event_edit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_id uuid NOT NULL,
  edited_by uuid REFERENCES auth.users(id),
  field_name text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  action_type text NOT NULL -- 'update', 'location_correction', 'batch_update'
);

-- Enable RLS
ALTER TABLE public.event_edit_history ENABLE ROW LEVEL SECURITY;

-- Admins can view edit history
CREATE POLICY "Admins can view edit history"
ON public.event_edit_history
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can insert edit history
CREATE POLICY "Admins can insert edit history"
ON public.event_edit_history
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster lookups
CREATE INDEX idx_event_edit_history_event_id ON public.event_edit_history(event_id);
CREATE INDEX idx_event_edit_history_created_at ON public.event_edit_history(created_at DESC);