import { create } from 'zustand'
import { supabase } from '../lib/supabaseClient'

const ONBOARDED_KEY = 'expiry-tracker:onboarded'

export const useAuthStore = create((set) => ({
  session: null,

  // True until the initial getSession() call resolves. Without this the app
  // would flash the Login screen on every refresh before Supabase has had a
  // chance to restore the stored session.
  loading: true,

  hasOnboarded: localStorage.getItem(ONBOARDED_KEY) === 'true',

  setSession: (session) => set({ session, loading: false }),

  completeOnboarding: () => {
    localStorage.setItem(ONBOARDED_KEY, 'true')
    set({ hasOnboarded: true })
  },

  // Session state is cleared by the onAuthStateChange listener in App.jsx,
  // which fires SIGNED_OUT -- no need to set it here as well.
  signOut: () => supabase.auth.signOut(),
}))
