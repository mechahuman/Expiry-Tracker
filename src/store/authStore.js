import { create } from 'zustand'
import { supabase } from '../lib/supabaseClient'
import { clearAllItems } from '../lib/offlineCache'

const ONBOARDED_KEY = 'expiry-tracker:onboarded'

// localStorage throws rather than returning null when storage is unavailable
// -- Safari private mode, blocked site data, some embedded webviews. This runs
// during store creation, i.e. at module import, so an unguarded access takes
// the whole app down before React renders and before any error boundary
// exists to catch it. Onboarding showing twice is a far better failure.
function readOnboarded() {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === 'true'
  } catch {
    return false
  }
}

function persistOnboarded() {
  try {
    localStorage.setItem(ONBOARDED_KEY, 'true')
  } catch {
    /* Non-fatal: onboarding just won't be remembered next visit. */
  }
}

export const useAuthStore = create((set) => ({
  session: null,

  // True until the initial getSession() call resolves. Without this the app
  // would flash the Login screen on every refresh before Supabase has had a
  // chance to restore the stored session.
  loading: true,

  hasOnboarded: readOnboarded(),

  setSession: (session) => set({ session, loading: false }),

  completeOnboarding: () => {
    persistOnboarded()
    set({ hasOnboarded: true })
  },

  // Session state is cleared by the onAuthStateChange listener in App.jsx,
  // which fires SIGNED_OUT -- no need to set it here as well.
  signOut: () => {
    // Drop every cached inventory first. The whole point of signing out on a
    // shared device is that the next person sees nothing of the last, and the
    // offline cache would otherwise still be sitting in localStorage.
    clearAllItems()
    return supabase.auth.signOut()
  },
}))
