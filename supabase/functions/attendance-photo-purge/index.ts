/** attendance-photo-purge — Deno entry point; logic lives in handler.ts. verify_jwt=false: the handler checks its own bearer. */
import { handle } from './handler.ts'

Deno.serve((req: Request) =>
  handle(req, {
    url: Deno.env.get('SUPABASE_URL') ?? '',
    key: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    secret: Deno.env.get('ATTENDANCE_PURGE_SECRET') ?? '',
  }))
