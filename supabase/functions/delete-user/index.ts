// Retired. People are deactivated (and can be reactivated) from Settings > Team, using the deactivate_user and
// reactivate_user database functions, so no login is ever permanently deleted from the app.
//
// This used to let any company owner permanently delete any user, including accounts that had not joined a company
// yet. It now only answers "gone". It can be removed from the backend entirely.

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  return new Response(
    JSON.stringify({ error: 'This function has been retired. Deactivate people from Settings > Team instead.' }),
    { status: 410, headers: { 'Content-Type': 'application/json' } },
  );
});
