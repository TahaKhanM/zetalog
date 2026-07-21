-- Harden function execute grants.
--
-- handle_new_user() is a SECURITY DEFINER trigger on auth.users; it runs as its
-- owner from the GoTrue/service context and must never be callable directly by a
-- client role. Postgres grants EXECUTE on new functions to PUBLIC by default, so
-- revoke it from PUBLIC and the client roles explicitly (defense in depth — the
-- trigger path is unaffected because trigger execution does not consult EXECUTE
-- privilege on the client roles).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
