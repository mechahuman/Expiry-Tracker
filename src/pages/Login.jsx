import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuthStore } from '../store/authStore'
import './Login.css'

export default function Login() {
  const session = useAuthStore((s) => s.session)
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm()

  // Already signed in (e.g. hit /login directly with a live session) -- the
  // redirect happens here rather than in a useEffect so there's no flash.
  if (session) return <Navigate to="/home" replace />

  const onSubmit = async ({ email, password }) => {
    setFormError('')
    setNotice('')

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) return setFormError(error.message)

      // No session comes back when email confirmation is enabled in Supabase.
      // It's disabled for development, but handle it so turning it back on for
      // launch doesn't silently leave the user staring at an unchanged screen.
      if (!data.session) {
        setNotice('Check your inbox to confirm your email, then sign in.')
        setMode('login')
      }
      // On success the onAuthStateChange listener in App.jsx picks up the new
      // session and the redirect above fires on the next render.
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setFormError(error.message)
  }

  const isSignup = mode === 'signup'

  return (
    <div className="login">
      <header className="login-header">
        <p className="login-brand">ClearEat</p>
        <p className="login-tagline">See it all. Eat it first.</p>
        <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p>
          {isSignup
            ? 'Start tracking what’s in your kitchen.'
            : 'Sign in to pick up where you left off.'}
        </p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /\S+@\S+\.\S+/, message: 'Enter a valid email' },
            })}
          />
          {errors.email && <p className="field-error">{errors.email.message}</p>}
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            placeholder="••••••••"
            {...register('password', {
              required: 'Password is required',
              minLength: { value: 6, message: 'At least 6 characters' },
            })}
          />
          {errors.password && <p className="field-error">{errors.password.message}</p>}
        </label>

        {formError && <p className="form-banner error">{formError}</p>}
        {notice && <p className="form-banner notice">{notice}</p>}

        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Please wait…' : isSignup ? 'Sign up' : 'Log in'}
        </button>
      </form>

      <p className="switch-mode">
        {isSignup ? 'Already have an account?' : 'New here?'}{' '}
        <button
          type="button"
          className="btn-text"
          onClick={() => {
            setMode(isSignup ? 'login' : 'signup')
            setFormError('')
            setNotice('')
          }}
        >
          {isSignup ? 'Log in' : 'Create one'}
        </button>
      </p>

      {/* Google OAuth deliberately deferred -- it needs a Google Cloud project
          and consent screen. The button slots in here when that's set up. */}
    </div>
  )
}
