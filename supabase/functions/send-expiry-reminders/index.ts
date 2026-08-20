/**
 * Sends the daily expiry reminder.
 *
 * Triggered by pg_cron (see supabase/004_cron_reminders.sql), not by the app.
 * Runs with the service role so it can read every user's items -- RLS is
 * bypassed deliberately here, which is why the endpoint is secret-gated.
 *
 * Deploy:  npx supabase functions deploy send-expiry-reminders
 */
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { buildReminder, type ExpiringItem } from './message.ts'

const DAYS_AHEAD = 3

// The schedule is expressed in IST, so "today" must be too. Deriving it from
// the wall clock keeps a manual mid-afternoon test consistent with the 9am
// cron run, instead of quietly using whatever date UTC happens to be on.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

function istDate(daysAhead = 0): string {
  const now = new Date(Date.now() + IST_OFFSET_MS)
  now.setUTCDate(now.getUTCDate() + daysAhead)
  return now.toISOString().slice(0, 10)
}

Deno.serve(async (req: Request) => {
  const expectedSecret = Deno.env.get('CRON_SECRET')
  if (!expectedSecret || req.headers.get('x-cron-secret') !== expectedSecret) {
    // Also fails when the secret isn't configured at all -- an unprotected
    // endpoint that can push to every user is worse than a broken one.
    return new Response('Unauthorized', { status: 401 })
  }

  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    return Response.json({ error: 'VAPID keys are not configured' }, { status: 500 })
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const today = istDate()
  const cutoff = istDate(DAYS_AHEAD)

  // Anything already expired is included (gte today would miss it) only if it
  // expired today; older items are left alone, since nagging about food that
  // went off last week isn't actionable.
  const { data: items, error: itemsError } = await supabase
    .from('inventory_items')
    .select('user_id, name, expiry_date')
    .eq('status', 'active')
    .gte('expiry_date', today)
    .lte('expiry_date', cutoff)

  if (itemsError) {
    return Response.json({ error: itemsError.message }, { status: 500 })
  }
  if (!items || items.length === 0) {
    return Response.json({ sent: 0, note: 'nothing expiring' })
  }

  const byUser = new Map<string, ExpiringItem[]>()
  for (const item of items) {
    const list = byUser.get(item.user_id) ?? []
    list.push({ name: item.name, expiry_date: item.expiry_date })
    byUser.set(item.user_id, list)
  }

  const { data: subscriptions, error: subsError } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', [...byUser.keys()])
    .is('expired_at', null)

  if (subsError) {
    return Response.json({ error: subsError.message }, { status: 500 })
  }

  let sent = 0
  const dead: string[] = []

  await Promise.all(
    (subscriptions ?? []).map(async (sub) => {
      const reminder = buildReminder(byUser.get(sub.user_id) ?? [], today)
      if (!reminder) return

      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify({ ...reminder, url: '/home' }),
        )
        sent += 1
      } catch (error) {
        // 404/410 mean the browser threw the subscription away (uninstalled,
        // cleared data, permission revoked). Those are permanent, so retiring
        // the row stops us retrying it every morning forever. Anything else
        // is likely transient and worth keeping.
        const status = (error as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) dead.push(sub.id)
        else console.error('Push failed for', sub.id, error)
      }
    }),
  )

  if (dead.length > 0) {
    await supabase
      .from('push_subscriptions')
      .update({ expired_at: new Date().toISOString() })
      .in('id', dead)
  }

  if (sent > 0) {
    await supabase
      .from('push_subscriptions')
      .update({ last_sent_at: new Date().toISOString() })
      .in('user_id', [...byUser.keys()])
      .is('expired_at', null)
  }

  return Response.json({ sent, retired: dead.length, users: byUser.size })
})
