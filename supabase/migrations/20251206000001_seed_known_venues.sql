-- Seed Known Venues Migration
-- This migration populates the known_venues table with 72 well-known Philippine music/nightlife venues
-- These venues will be used by the AI extraction system to improve venue matching accuracy

INSERT INTO public.known_venues (name, lat, lng, address, city, aliases, instagram_handle) VALUES
  -- P0: Core Music Venues
  ('123 Block', 14.6240, 121.0410, '123 Block, Scout Tuason', 'Quezon City', ARRAY['123Block', '123'], '@123block'),
  ('19 East', 14.4592, 121.0461, '19 East Avenue', 'Sucat, Parañaque', ARRAY['19East'], '@19east'),
  ('Route 196', 14.6369, 121.0789, '196 Katipunan Avenue', 'Quezon City', ARRAY['Route196'], '@route196'),
  ('SaGuijo', 14.5636, 121.0321, 'SaGuijo Cafe + Bar', 'Makati', ARRAY['Saguijo', 'Sa Guijo'], '@saguijo'),
  ('B-Side', 14.5536, 121.0267, 'The Collective, 7274 Malugay St', 'Makati', ARRAY['BSide', 'B Side'], '@bsidemanila'),
  ('Mow''s Bar', 14.5545, 121.0266, 'The Collective, Malugay St', 'Makati', ARRAY['Mows', 'Mow''s'], '@mowsbar'),
  ('Black Market', 14.5543, 121.0267, 'The Collective', 'Makati', ARRAY['BlackMarket'], '@blackmarketmnl'),
  
  -- Makati/BGC Area
  ('Cubao Expo', 14.6220, 121.0563, 'General Romulo Avenue', 'Quezon City', ARRAY['CubaoExpo'], '@cubaoexpo'),
  ('20:20', 14.5541, 121.0471, 'G/F Net One Center, 26th St corner 3rd Ave', 'BGC, Taguig', ARRAY['2020', 'Twenty Twenty'], '@2020manila'),
  ('Poblacion Social Club', 14.5616, 121.0308, 'Poblacion, Makati', 'Makati', ARRAY['PSC', 'Pob Social Club'], '@poblacionsocialclub'),
  ('The Curator', 14.5611, 121.0312, '5935 Guijo St', 'Makati', ARRAY['Curator'], '@thecurator.mnl'),
  ('Tomato Kick', 14.5618, 121.0314, '5930 Enriquez St', 'Makati', ARRAY['TomatoKick'], '@tomatokick'),
  ('Oha Hapon', 14.5620, 121.0309, 'Poblacion, Makati', 'Makati', ARRAY['Ohahapon', 'Oha'], '@ohahapon'),
  ('Crying Tiger', 14.5625, 121.0311, 'Poblacion, Makati', 'Makati', ARRAY['CryingTiger'], '@cryingtigerph'),
  ('Cav Social Club', 14.5612, 121.0314, 'Poblacion, Makati', 'Makati', ARRAY['Cav'], '@cavsocialclub'),
  ('Tambai', 14.5614, 121.0310, 'Poblacion, Makati', 'Makati', ARRAY['Tambai Bar'], '@tambai.ph'),
  ('Chotto Matte Manila', 14.5502, 121.0482, 'Uptown Parade, BGC', 'Taguig', ARRAY['Chotto Matte', 'ChottoMatte'], '@chottomatte'),
  ('XYLO at The Palace', 14.5508, 121.0481, 'The Palace, BGC', 'Taguig', ARRAY['XYLO', 'Xylo'], '@xyloatthepalace'),
  ('Revel at The Palace', 14.5508, 121.0481, 'The Palace, BGC', 'Taguig', ARRAY['Revel'], '@revelmanila'),
  
  -- Quezon City Area
  ('Sev''s Cafe', 14.6267, 121.0564, 'Cubao Expo', 'Quezon City', ARRAY['Sevs', 'Sev''s'], '@sevscafe'),
  ('Conspiracy Garden Cafe', 14.6514, 121.0502, '59 Visayas Avenue', 'Quezon City', ARRAY['Conspiracy', 'CGC'], '@conspiracygardencafe'),
  ('Big Sky Mind', 14.6225, 121.0565, 'Cubao Expo', 'Quezon City', ARRAY['BigSkyMind', 'Big Sky'], '@bigskymind'),
  ('Handlebar', 14.6222, 121.0567, 'Cubao Expo', 'Quezon City', ARRAY['HandleBar'], '@handlebarmnl'),
  ('Fred''s Revolucion', 14.6223, 121.0566, 'Cubao Expo', 'Quezon City', ARRAY['Freds', 'Fred''s'], '@fredsrevolucion'),
  ('Bellini''s', 14.6228, 121.0561, 'Cubao Expo', 'Quezon City', ARRAY['Bellinis'], '@bellinisph'),
  ('Tomato Kick QC', 14.6363, 121.0793, 'UP Town Center', 'Quezon City', ARRAY['TomatoKick QC'], '@tomatokick'),
  ('Fuze Republic', 14.6377, 121.0795, 'Katipunan Avenue', 'Quezon City', ARRAY['Fuze'], '@fuzerepublic'),
  
  -- BGC / Fort Bonifacio
  ('Valkyrie', 14.5502, 121.0477, 'The Palace, BGC', 'Taguig', ARRAY['Valkyrie BGC'], '@valkyriemanila'),
  ('Encore Beach Club', 14.5522, 121.0488, 'Fort Entertainment Complex', 'Taguig', ARRAY['Encore', 'Encore BGC'], '@encorebeachclub'),
  ('The Palace Manila', 14.5508, 121.0481, '9th Avenue corner 36th Street', 'Taguig', ARRAY['Palace Manila', 'Palace'], '@thepalacemanila'),
  
  -- Malls and Large Venues
  ('SM Mall of Asia', 14.5352, 120.9818, 'SM Mall of Asia Complex', 'Pasay', ARRAY['MOA', 'SM MOA', 'Mall of Asia'], '@smmallofasia'),
  ('SM Aura Premier', 14.5468, 121.0513, '26th St corner McKinley Parkway', 'Taguig', ARRAY['Aura', 'SM Aura'], '@smaurapremier'),
  ('Ayala Malls Vertis North', 14.6602, 121.0363, 'Quezon City', 'Quezon City', ARRAY['Vertis North', 'Vertis'], '@ayalavertis'),
  ('Trinoma', 14.6560, 121.0318, 'EDSA corner North Avenue', 'Quezon City', ARRAY['Trinoma Mall'], '@trinoma'),
  ('Glorietta', 14.5508, 121.0244, 'Ayala Center, Makati', 'Makati', ARRAY['Glorietta Mall'], '@gloriettaglorietta'),
  ('Greenbelt', 14.5532, 121.0218, 'Ayala Center, Makati', 'Makati', ARRAY['Greenbelt Mall'], '@greenbeltmakati'),
  ('Bonifacio High Street', 14.5507, 121.0470, 'BGC', 'Taguig', ARRAY['BGC', 'High Street', 'BHS'], '@bonihighstreet'),
  ('UP Town Center', 14.6363, 121.0793, 'Katipunan Avenue', 'Quezon City', ARRAY['UPTC', 'UP Town'], '@uptowncenter'),
  ('Eastwood City', 14.6090, 121.0776, 'Libis, Quezon City', 'Quezon City', ARRAY['Eastwood', 'Eastwood Mall'], '@eastwoodcity'),
  
  -- Music Venues & Bars
  ('Strumm''s', 14.5621, 121.0312, '5823 Enriquez St, Poblacion', 'Makati', ARRAY['Strumms', 'Strumm''s'], '@strumms'),
  ('Cosmic', 14.5618, 121.0311, 'Poblacion, Makati', 'Makati', ARRAY['Cosmic Bar'], '@cosmicbar'),
  ('Ronin', 14.5613, 121.0313, 'Poblacion, Makati', 'Makati', ARRAY['Ronin Bar'], '@roninbar'),
  ('El Chupacabra', 14.5615, 121.0314, 'Poblacion, Makati', 'Makati', ARRAY['Chupacabra'], '@elchupacabraph'),
  ('Jess & Pat''s', 14.5619, 121.0310, 'Poblacion, Makati', 'Makati', ARRAY['Jess and Pats', 'J&P'], '@jessandpats'),
  ('The Hole in the Wall', 14.5542, 121.0268, 'The Collective, Century City', 'Makati', ARRAY['Hole in Wall', 'HITW'], '@theholeinthewall'),
  
  -- Concert Halls & Theaters
  ('Smart Araneta Coliseum', 14.6227, 121.0502, 'Araneta City', 'Quezon City', ARRAY['Araneta', 'Big Dome'], '@smartaraneta'),
  ('Mall of Asia Arena', 14.5327, 120.9832, 'MOA Complex', 'Pasay', ARRAY['MOA Arena'], '@moaarena'),
  ('Newport Performing Arts Theater', 14.5164, 121.0195, 'Resorts World Manila', 'Pasay', ARRAY['Newport Theater', 'NPAT'], '@rwmanila'),
  ('Ayala Malls Manila Bay', 14.5368, 120.9838, 'Diosdado Macapagal Blvd', 'Parañaque', ARRAY['Manila Bay', 'AMManilaBay'], '@ayalamanilabay'),
  ('Solaire Resort', 14.5243, 120.9868, 'Entertainment City', 'Parañaque', ARRAY['Solaire'], '@solaireresort'),
  ('City of Dreams Manila', 14.5197, 120.9872, 'Entertainment City', 'Parañaque', ARRAY['COD Manila', 'City of Dreams'], '@cityofdreamsmanila'),
  
  -- Alternative & Underground Venues
  ('Warehouse 930', 14.5545, 121.0267, 'The Collective', 'Makati', ARRAY['Warehouse930', '930'], '@warehouse930'),
  ('Cafe Havana', 14.5549, 121.0269, 'The Collective', 'Makati', ARRAY['CafeHavana', 'Havana'], '@cafehavanamanila'),
  ('Dulo', 14.5616, 121.0309, 'Poblacion, Makati', 'Makati', ARRAY['Dulo Bar'], '@dulobar'),
  ('Nori Yard', 14.6224, 121.0564, 'Cubao Expo', 'Quezon City', ARRAY['Nori'], '@noriyard'),
  ('Hanamaruken', 14.6221, 121.0567, 'Cubao Expo', 'Quezon City', ARRAY['Hanamaruken Ramen'], '@hanamaruken'),
  
  -- Resorts & Hotels
  ('Okada Manila', 14.5287, 120.9858, 'Entertainment City', 'Parañaque', ARRAY['Okada'], '@okadamanila'),
  ('Shangri-La at the Fort', 14.5504, 121.0489, '30th Street corner 5th Avenue, BGC', 'Taguig', ARRAY['Shangri-La', 'Shangri-La Fort'], '@shangrilabonifacio'),
  ('Sofitel Philippine Plaza Manila', 14.5371, 120.9996, 'CCP Complex', 'Pasay', ARRAY['Sofitel', 'Sofitel Manila'], '@sofitelmanila'),
  
  -- Restaurants & Lounges with Events
  ('Draft Gastropub', 14.5512, 121.0475, 'BGC', 'Taguig', ARRAY['Draft'], '@draftph'),
  ('Ramen Nagi', 14.5511, 121.0478, 'BGC', 'Taguig', ARRAY['Nagi'], '@ramennagi_jp'),
  ('The Grid Food Market', 14.5463, 121.0506, 'Power Plant Mall', 'Makati', ARRAY['Grid', 'The Grid'], '@thegridfoodmarket'),
  
  -- Outdoor & Event Spaces
  ('Bonifacio Global City', 14.5507, 121.0470, 'BGC', 'Taguig', ARRAY['BGC', 'Fort Bonifacio'], '@bonifacioglobalcity'),
  ('Ayala Triangle Gardens', 14.5577, 121.0269, 'Makati Avenue', 'Makati', ARRAY['Ayala Triangle', 'Triangle Gardens'], '@ayalatriangle'),
  ('Luneta Park', 14.5833, 120.9750, 'Rizal Park, Manila', 'Manila', ARRAY['Rizal Park', 'Luneta'], '@rizalparkmanila'),
  
  -- Specialty Bars
  ('The Spirits Library', 14.5614, 121.0315, 'Poblacion, Makati', 'Makati', ARRAY['Spirits Library', 'TSL'], '@thespiritslibrary'),
  ('ABV', 14.5619, 121.0312, 'Poblacion, Makati', 'Makati', ARRAY['ABV Bar'], '@abvmanila'),
  ('Z Hostel Makati Rooftop', 14.5617, 121.0313, '5660 Don Pedro St', 'Makati', ARRAY['Z Hostel', 'Z Rooftop'], '@zhostel'),
  ('Century City Mall', 14.5638, 121.0304, 'Kalayaan Avenue', 'Makati', ARRAY['Century City'], '@centurycitymall'),
  ('Rockwell Center', 14.5655, 121.0377, 'Makati', 'Makati', ARRAY['Rockwell', 'Power Plant'], '@rockwellcenter')
ON CONFLICT DO NOTHING;
