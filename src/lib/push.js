import { supabase } from './supabaseClient'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

/**
 * Standard Web Push -- no Firebase. The browser handles subscription and
 * delivery; we just store the resulting subscription so the nightly Edge
 * Function knows where to send.
 */

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** 'default' (never asked), 'granted', 'denied', or 'unsupported'. */
export function getPermission() {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

/**
 * The VAPID key travels as base64url but `pushManager.subscribe` wants raw
 * bytes, and base64url isn't what atob expects -- hence the padding and the
 * two character substitutions.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}

/**
 * Asks permission (if not already decided), subscribes, and stores the
 * subscription against the current user.
 *
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function enablePushNotifications(userId) {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' }
  if (!VAPID_PUBLIC_KEY) {
    console.error('VITE_VAPID_PUBLIC_KEY is not set; push cannot be enabled.')
    return { ok: false, reason: 'misconfigured' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: permission }

  const registration = await navigator.serviceWorker.ready

  // Re-subscribing an already-subscribed browser returns the existing
  // subscription rather than erroring, so this covers both first run and a
  // later login on the same device.
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      // Required by Chrome: every push must result in a visible notification.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))

  const json = subscription.toJSON()

  // Endpoint is unique, so onConflict turns a repeat subscribe into an update
  // -- and re-points the row at whoever is logged in now, which matters on a
  // shared device. expired_at is cleared in case this endpoint was previously
  // marked dead and has come back.
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent.slice(0, 500),
      expired_at: null,
    },
    { onConflict: 'endpoint' },
  )

  if (error) {
    console.error('Could not save push subscription:', error.message)
    return { ok: false, reason: 'save-failed' }
  }

  return { ok: true }
}
