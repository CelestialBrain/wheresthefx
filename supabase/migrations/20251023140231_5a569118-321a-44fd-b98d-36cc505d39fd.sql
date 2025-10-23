-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'host', 'user');

-- Create enum for event types
CREATE TYPE public.event_type AS ENUM ('party', 'thrift', 'market', 'concert', 'other');

-- Create enum for event status
CREATE TYPE public.event_status AS ENUM ('draft', 'published', 'cancelled', 'completed');

-- Create enum for event visibility
CREATE TYPE public.event_visibility AS ENUM ('public', 'private', 'unlisted');

-- Create enum for attendee status
CREATE TYPE public.attendee_status AS ENUM ('interested', 'going', 'maybe', 'cancelled');

-- Create enum for report status
CREATE TYPE public.report_status AS ENUM ('pending', 'reviewed', 'resolved');

-- Create user_roles table (CRITICAL: separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  is_host BOOLEAN NOT NULL DEFAULT false,
  location_lat NUMERIC,
  location_lng NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create events table
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type event_type NOT NULL,
  location_name TEXT NOT NULL,
  location_address TEXT NOT NULL,
  location_lat NUMERIC NOT NULL,
  location_lng NUMERIC NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME NOT NULL,
  end_time TIME,
  capacity INTEGER,
  cover_image_url TEXT,
  is_free BOOLEAN NOT NULL DEFAULT true,
  price NUMERIC,
  status event_status NOT NULL DEFAULT 'draft',
  visibility event_visibility NOT NULL DEFAULT 'public',
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Create event_attendees table
CREATE TABLE public.event_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status attendee_status NOT NULL DEFAULT 'interested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- Enable RLS on event_attendees
ALTER TABLE public.event_attendees ENABLE ROW LEVEL SECURITY;

-- Create event_images table
CREATE TABLE public.event_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  image_url TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on event_images
ALTER TABLE public.event_images ENABLE ROW LEVEL SECURITY;

-- Create reports table
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status report_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on reports
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create trigger for profiles updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for events updated_at
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  
  -- Assign default 'user' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies for profiles
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles
  FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for events
CREATE POLICY "Published public events are viewable by everyone"
  ON public.events
  FOR SELECT
  USING (
    status = 'published' AND visibility = 'public'
    OR host_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'moderator')
  );

CREATE POLICY "Hosts can create their own events"
  ON public.events
  FOR INSERT
  WITH CHECK (
    auth.uid() = host_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_host = true
    )
  );

CREATE POLICY "Hosts can update their own events"
  ON public.events
  FOR UPDATE
  USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can delete their own events"
  ON public.events
  FOR DELETE
  USING (auth.uid() = host_id);

CREATE POLICY "Admins can manage all events"
  ON public.events
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for event_attendees
CREATE POLICY "Anyone can view attendees of published events"
  ON public.event_attendees
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE id = event_id AND status = 'published'
    )
  );

CREATE POLICY "Authenticated users can manage their attendance"
  ON public.event_attendees
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own attendance"
  ON public.event_attendees
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own attendance"
  ON public.event_attendees
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for event_images
CREATE POLICY "Event images are viewable with their events"
  ON public.event_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE id = event_id
      AND (status = 'published' OR host_id = auth.uid())
    )
  );

CREATE POLICY "Hosts can manage images for their events"
  ON public.event_images
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE id = event_id AND host_id = auth.uid()
    )
  );

-- RLS Policies for reports
CREATE POLICY "Users can view their own reports"
  ON public.reports
  FOR SELECT
  USING (auth.uid() = reporter_id OR public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can create reports"
  ON public.reports
  FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Moderators can update reports"
  ON public.reports
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can manage roles"
  ON public.user_roles
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Create storage buckets for images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('event-images', 'event-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('profile-avatars', 'profile-avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp']);

-- Storage policies for event-images
CREATE POLICY "Event images are publicly viewable"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'event-images');

CREATE POLICY "Authenticated users can upload event images"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'event-images'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Users can update their own event images"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'event-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own event images"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'event-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for profile-avatars
CREATE POLICY "Avatar images are publicly viewable"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'profile-avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'profile-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'profile-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Create indexes for better query performance
CREATE INDEX idx_events_location ON public.events(location_lat, location_lng);
CREATE INDEX idx_events_date ON public.events(event_date);
CREATE INDEX idx_events_status ON public.events(status);
CREATE INDEX idx_events_host_id ON public.events(host_id);
CREATE INDEX idx_event_attendees_event_id ON public.event_attendees(event_id);
CREATE INDEX idx_event_attendees_user_id ON public.event_attendees(user_id);
CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);