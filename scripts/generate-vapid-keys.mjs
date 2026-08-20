/**
 * Generates the VAPID keypair that identifies this app to push services.
 *
 *   node scripts/generate-vapid-keys.mjs
 *
 * Run once. The public key is safe to ship in the frontend; the private key is
 * a secret and belongs only in Supabase's Edge Function secrets. Regenerating
 * invalidates every existing subscription, so don't re-run casually.
 */
import webpush from 'web-push'

const { publicKey, privateKey } = webpush.generateVAPIDKeys()

console.log(`
VAPID keypair generated.

1. Frontend -- add to .env.local AND to Vercel's environment variables:

   VITE_VAPID_PUBLIC_KEY=${publicKey}

2. Backend -- set as a Supabase Edge Function secret (never commit this):

   npx supabase secrets set VAPID_PUBLIC_KEY=${publicKey}
   npx supabase secrets set VAPID_PRIVATE_KEY=${privateKey}
   npx supabase secrets set VAPID_SUBJECT=mailto:you@example.com

   VAPID_SUBJECT must be a real mailto: or https: URL -- push services use it
   to contact you if this app starts misbehaving.
`)
