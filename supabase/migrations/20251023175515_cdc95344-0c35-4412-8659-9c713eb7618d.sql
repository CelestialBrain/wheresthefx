-- Fix security definer view by enabling security invoker mode
ALTER VIEW popular_instagram_accounts SET (security_invoker = on);