import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Set when the app is built or served without its Supabase environment
 * variables. main.jsx checks this and renders an explanatory screen.
 *
 * This used to `throw` here instead. Failing fast is right, but a module-level
 * throw happens during import -- before React renders and before any error
 * boundary is mounted -- so the only symptom was a blank white page with the
 * reason buried in the console. Which is exactly what a Vercel deploy missing
 * its env vars looked like.
 */
export const configError =
  !supabaseUrl || !supabaseAnonKey
    ? 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Set them in .env.local for local development, or in the hosting provider’s environment variables for a deployment.'
    : ''

// Placeholder values keep createClient from throwing on its own; nothing can
// reach the network anyway, because main.jsx renders the error screen instead
// of the app whenever configError is set.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
)
