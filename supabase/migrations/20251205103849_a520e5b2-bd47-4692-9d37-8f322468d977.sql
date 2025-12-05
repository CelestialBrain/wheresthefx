-- Phase 1: Add category columns to all tables

-- Add default_category to instagram_accounts
ALTER TABLE instagram_accounts 
ADD COLUMN IF NOT EXISTS default_category TEXT DEFAULT 'other';

-- Add category to instagram_posts
ALTER TABLE instagram_posts 
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other';

-- Add category to published_events
ALTER TABLE published_events 
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other';

-- Insert all 92 Instagram accounts with their categories
INSERT INTO instagram_accounts (username, is_active, scrape_depth, default_category) VALUES
-- NIGHTLIFE (22 accounts)
('225lounge', true, 15, 'nightlife'),
('78salcedo', true, 15, 'nightlife'),
('apothekamanila', true, 15, 'nightlife'),
('backroomph', true, 15, 'nightlife'),
('barnineph', true, 15, 'nightlife'),
('blackbox.katipunan', true, 15, 'nightlife'),
('cabanaclub.ph', true, 15, 'nightlife'),
('intbar.extcafe', true, 15, 'nightlife'),
('kampaiph', true, 15, 'nightlife'),
('lankwaispeakeasy', true, 15, 'nightlife'),
('livingroomat42', true, 15, 'nightlife'),
('nokal.manila', true, 15, 'nightlife'),
('quezonclub', true, 15, 'nightlife'),
('radiuskatipunan', true, 15, 'nightlife'),
('rubywongs', true, 15, 'nightlife'),
('runrabbitrun.ph', true, 15, 'nightlife'),
('sanctuary.mnl', true, 15, 'nightlife'),
('the_funroof', true, 15, 'nightlife'),
('theunlockedbar', true, 15, 'nightlife'),
('tippleandslawkatip', true, 15, 'nightlife'),
('uglyduckpoblacion', true, 15, 'nightlife'),
('walrus.katipunan', true, 15, 'nightlife'),
-- MUSIC (12 accounts)
('andfriends.fest', true, 15, 'music'),
('balconymusichouse', true, 15, 'music'),
('gigsmanilaph', true, 15, 'music'),
('goodvibrationsrecords', true, 15, 'music'),
('housecollabunderground', true, 15, 'music'),
('indiemanilalive', true, 15, 'music'),
('jessxpats', true, 15, 'music'),
('letthemcook.ph', true, 15, 'music'),
('mowsbar', true, 15, 'music'),
('tagojazz', true, 15, 'music'),
('the70sbistrobar', true, 15, 'music'),
('timeless.collective.ph', true, 15, 'music'),
-- ART & CULTURE (10 accounts)
('artfairph', true, 15, 'art_culture'),
('bgcartscenter', true, 15, 'art_culture'),
('cinema76fs', true, 15, 'art_culture'),
('cinemathequemnl', true, 15, 'art_culture'),
('drawingroommanila', true, 15, 'art_culture'),
('firstunitedbldg1928', true, 15, 'art_culture'),
('gravityartspace', true, 15, 'art_culture'),
('sine.pop', true, 15, 'art_culture'),
('sprucegalleryph', true, 15, 'art_culture'),
('upfifilmcenter', true, 15, 'art_culture'),
-- MARKETS (21 accounts)
('community.fleamarket', true, 15, 'markets'),
('goodolddays.ww', true, 15, 'markets'),
('hermarketmanila', true, 15, 'markets'),
('hubmakelab', true, 15, 'markets'),
('katutubopopupmarket', true, 15, 'markets'),
('lastchance.mnl', true, 15, 'markets'),
('lokalpopup', true, 15, 'markets'),
('lotsoflocal', true, 15, 'markets'),
('maartefair', true, 15, 'markets'),
('magicsandmystics', true, 15, 'markets'),
('merkado.market', true, 15, 'markets'),
('nirvanacollective.co', true, 15, 'markets'),
('soireebyretaillab', true, 15, 'markets'),
('soukpopup', true, 15, 'markets'),
('stickerconmnl', true, 15, 'markets'),
('theheritagecollective', true, 15, 'markets'),
('themanilamarketclub', true, 15, 'markets'),
('thesolanamarket', true, 15, 'markets'),
('thisvintageweekend', true, 15, 'markets'),
('vecinamarket', true, 15, 'markets'),
('wetmarketph', true, 15, 'markets'),
-- FOOD (5 accounts)
('intlmanilafoodfestival', true, 15, 'food'),
('mercatocentraleph', true, 15, 'food'),
('messysummers', true, 15, 'food'),
('salcedomarket', true, 15, 'food'),
('the_tasting_club', true, 15, 'food'),
-- WORKSHOPS (5 accounts)
('bumi.and.ashe', true, 15, 'workshops'),
('craftmnl', true, 15, 'workshops'),
('creative.workshops.mnl', true, 15, 'workshops'),
('odangputik_potteryph', true, 15, 'workshops'),
('venus.collab', true, 15, 'workshops'),
-- COMMUNITY (5 accounts)
('pinoyreads', true, 15, 'community'),
('seasonpassph', true, 15, 'community'),
('silentbookclubmanila', true, 15, 'community'),
('thermospect_', true, 15, 'community'),
('threadfulclub', true, 15, 'community'),
-- OTHER/CAFES (13 accounts)
('5gcoffeehouse_mnl', true, 15, 'other'),
('cafe32ndst.bgc', true, 15, 'other'),
('communeph', true, 15, 'other'),
('escoltacoffee.co', true, 15, 'other'),
('heydaycafe___', true, 15, 'other'),
('kita_cafe_ph', true, 15, 'other'),
('makeitmakati', true, 15, 'other'),
('molitolifestylecenter', true, 15, 'other'),
('oddcafeph', true, 15, 'other'),
('onetwothreeblock', true, 15, 'other'),
('playlistcafeantipolo', true, 15, 'other'),
('xinchaomnl', true, 15, 'other'),
('winnieandthebees', true, 15, 'other')
ON CONFLICT (username) DO UPDATE SET 
  default_category = EXCLUDED.default_category,
  is_active = EXCLUDED.is_active,
  scrape_depth = EXCLUDED.scrape_depth;