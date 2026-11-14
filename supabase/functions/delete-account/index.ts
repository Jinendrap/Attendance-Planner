// Supabase Edge Function "delete-account".
// Lets a signed-in person permanently delete their own account and all their data.
// Every table is linked to the account with "on delete cascade", so deleting the account removes everything.
// Deploy with "Verify JWT" switched OFF (the function checks the sign-in itself).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Not allowed' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const { data } = token ? await admin.auth.getUser(token) : { data: { user: null } }
  if (!data?.user) return json({ error: 'Not allowed' }, 401)

  // Only ever the person who is signed in: the id comes from their token, never from the request.
  const { error } = await admin.auth.admin.deleteUser(data.user.id)
  if (error) return json({ error: 'Could not delete the account' }, 500)
  return json({ ok: true })
})
