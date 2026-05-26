-- Backend-only tables should not be readable or writable through public clients.
-- service_role keeps direct access and bypasses RLS for server-side rate-limit
-- checks/import tooling.

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_venue_import ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.api_rate_limits FROM anon, authenticated;
REVOKE ALL ON TABLE public.notion_venue_import FROM anon, authenticated;

GRANT ALL ON TABLE public.api_rate_limits TO service_role;
GRANT ALL ON TABLE public.notion_venue_import TO service_role;
