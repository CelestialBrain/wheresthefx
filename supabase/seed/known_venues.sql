-- Seed data for known_venues table
-- Data extracted from ncrGeoCache.ts

-- Pre-populate known_venues with common NCR venues

-- Quezon City Venues
INSERT INTO public.known_venues (name, aliases, address, city, lat, lng) VALUES
  ('SM City North EDSA', ARRAY['SM North EDSA', 'SM North'], 'North Avenue corner EDSA', 'Quezon City', 14.6565, 121.0296),
  ('Trinoma Mall', ARRAY['Trinoma'], 'North Avenue corner EDSA', 'Quezon City', 14.6561, 121.0327),
  ('Eastwood City', ARRAY['Eastwood'], 'Libis', 'Quezon City', 14.6094, 121.0775),
  ('UP Town Center', ARRAY['UPTC', 'UP TC'], 'Katipunan Avenue', 'Quezon City', 14.6527, 121.0693),
  ('Eton Centris', ARRAY['Centris'], 'EDSA corner Quezon Avenue', 'Quezon City', 14.6423, 121.0491),
  ('Cubao Expo', ARRAY['Cubao X', 'CubaoX'], 'General Romulo Avenue', 'Quezon City', 14.6193, 121.0519),
  ('Araneta City', ARRAY['Araneta Center'], 'Cubao', 'Quezon City', 14.6206, 121.0525),
  ('Smart Araneta Coliseum', ARRAY['Araneta Coliseum', 'Big Dome'], 'Araneta City, Cubao', 'Quezon City', 14.6209, 121.0517),
  ('Gateway Mall', ARRAY['Gateway Mall Cubao'], 'Araneta City, Cubao', 'Quezon City', 14.6197, 121.0529),
  ('SM City Fairview', ARRAY['SM Fairview'], 'Quirino Highway', 'Quezon City', 14.7131, 121.0563),
  ('Fairview Terraces', ARRAY['FT'], 'Quirino Highway', 'Quezon City', 14.7129, 121.0583),
  ('Vertis North', ARRAY['Vertis'], 'North Avenue', 'Quezon City', 14.6448, 121.0484)
ON CONFLICT DO NOTHING;

-- BGC / Taguig Venues
INSERT INTO public.known_venues (name, aliases, address, city, lat, lng) VALUES
  ('Bonifacio High Street', ARRAY['BGC High Street', 'High Street'], '5th Avenue', 'Taguig', 14.5505, 121.0515),
  ('Uptown Bonifacio', ARRAY['Uptown Mall', 'Uptown BGC'], '36th Street corner 9th Avenue', 'Taguig', 14.5657, 121.0534),
  ('Bonifacio Global City', ARRAY['BGC', 'The Fort'], NULL, 'Taguig', 14.5507, 121.0470),
  ('Market! Market!', ARRAY['Market Market'], 'McKinley Parkway', 'Taguig', 14.5491, 121.0553),
  ('Serendra', ARRAY['Serendra BGC'], 'McKinley Parkway', 'Taguig', 14.5514, 121.0458),
  ('Venice Grand Canal Mall', ARRAY['Venice Piazza', 'Venice Grand Canal'], 'McKinley Hill', 'Taguig', 14.5534, 121.0502)
ON CONFLICT DO NOTHING;

-- Makati Venues
INSERT INTO public.known_venues (name, aliases, address, city, lat, lng) VALUES
  ('Greenbelt', ARRAY['Greenbelt 1', 'Greenbelt 2', 'Greenbelt 3', 'Greenbelt 4', 'Greenbelt 5'], 'Makati Avenue', 'Makati', 14.5531, 121.0223),
  ('Glorietta', ARRAY['Glorietta 1', 'Glorietta 2', 'Glorietta 3', 'Glorietta 4', 'Glorietta 5'], 'Ayala Center', 'Makati', 14.5502, 121.0249),
  ('Ayala Triangle Gardens', ARRAY['Ayala Triangle'], 'Ayala Avenue', 'Makati', 14.5573, 121.0244),
  ('Poblacion Makati', ARRAY['Poblacion', 'Pob'], NULL, 'Makati', 14.5587, 121.0239),
  ('Legazpi Village', ARRAY['Legazpi'], NULL, 'Makati', 14.5565, 121.0172),
  ('Salcedo Village', ARRAY['Salcedo'], NULL, 'Makati', 14.5608, 121.0186),
  ('Salcedo Saturday Market', ARRAY['Salcedo Market'], 'Jaime Velasquez Park', 'Makati', 14.5608, 121.0186),
  ('Power Plant Mall', ARRAY['Powerplant'], 'Rockwell Center', 'Makati', 14.5634, 121.0357),
  ('Rockwell Center', ARRAY['Rockwell'], 'Estrella Street', 'Makati', 14.5634, 121.0357)
ON CONFLICT DO NOTHING;

-- Pasig Venues
INSERT INTO public.known_venues (name, aliases, address, city, lat, lng) VALUES
  ('SM Megamall', ARRAY['Megamall'], 'EDSA corner Julia Vargas Avenue', 'Pasig', 14.5850, 121.0564),
  ('Ortigas Center', ARRAY['Ortigas'], NULL, 'Pasig', 14.5864, 121.0564),
  ('Capitol Commons', ARRAY['Cap Comm'], 'Meralco Avenue', 'Pasig', 14.5826, 121.0603),
  ('The Podium', ARRAY['Podium'], 'ADB Avenue', 'Pasig', 14.5828, 121.0567),
  ('Estancia Capitol Commons', ARRAY['Estancia'], 'Capitol Commons', 'Pasig', 14.5826, 121.0603),
  ('Tiendesitas', ARRAY['Tiendas'], 'C5 Road', 'Pasig', 14.5908, 121.0699)
ON CONFLICT DO NOTHING;

-- Mandaluyong Venues
INSERT INTO public.known_venues (name, aliases, address, city, lat, lng) VALUES
  ('Shangri-La Plaza', ARRAY['Shang', 'Shang Plaza'], 'EDSA corner Shaw Boulevard', 'Mandaluyong', 14.5813, 121.0545),
  ('EDSA Shangri-La Hotel', ARRAY['EDSA Shang'], 'EDSA corner Shaw Boulevard', 'Mandaluyong', 14.5813, 121.0545)
ON CONFLICT DO NOTHING;

-- Manila / Pasay Venues
INSERT INTO public.known_venues (name, aliases, address, city, lat, lng) VALUES
  ('SM Mall of Asia', ARRAY['MOA', 'Mall of Asia', 'SM MOA'], 'Manila Bay Reclamation Area', 'Pasay', 14.5352, 120.9818),
  ('Intramuros', ARRAY['Walled City'], NULL, 'Manila', 14.5906, 120.9753),
  ('Binondo', ARRAY['Chinatown'], NULL, 'Manila', 14.5992, 120.9742),
  ('Ermita', ARRAY[], NULL, 'Manila', 14.5833, 120.9858),
  ('Malate', ARRAY[], NULL, 'Manila', 14.5739, 120.9914),
  ('Rizal Park', ARRAY['Luneta', 'Luneta Park'], 'Padre Burgos Avenue', 'Manila', 14.5831, 120.9794)
ON CONFLICT DO NOTHING;

-- Alabang / Muntinlupa Venues
INSERT INTO public.known_venues (name, aliases, address, city, lat, lng) VALUES
  ('Alabang Town Center', ARRAY['ATC'], 'Commerce Avenue', 'Muntinlupa', 14.4208, 121.0419),
  ('Festival Supermall', ARRAY['Festival Mall', 'Festival'], 'Filinvest Corporate City', 'Muntinlupa', 14.4189, 121.0476)
ON CONFLICT DO NOTHING;

-- Popular Event Venues (manually added based on common event posts)
INSERT INTO public.known_venues (name, aliases, address, city, lat, lng) VALUES
  ('Radius Katipunan', ARRAY['Radius', '@radius_katipunan'], '318 Katipunan Avenue', 'Quezon City', 14.6382, 121.0791),
  ('Mows Bar', ARRAY['mowsbar', '@mowsbar'], NULL, 'Makati', 14.5587, 121.0239),
  ('The Victor', ARRAY['Victor Art Installation', 'The Victor Art Installation'], 'Bridgetowne', 'Pasig', 14.5750, 121.0650),
  ('19 East', ARRAY['19east'], 'Sucat Road', 'Paranaque', 14.4879, 121.0314),
  ('Route 196', ARRAY['Route196', '@route196rocks'], 'Katipunan Avenue', 'Quezon City', 14.6369, 121.0789),
  ('SaGuijo', ARRAY['Saguijo Cafe', '@saguijo'], '7612 Guijo Street', 'Makati', 14.5636, 121.0321),
  ('B-Side', ARRAY['Bside', '@bsideph'], 'Makati Avenue', 'Makati', 14.5520, 121.0230)
ON CONFLICT DO NOTHING;
