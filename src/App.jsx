import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import './App.css'

function App() {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    // auth.getSession() just confirms the client can reach the Supabase API —
    // it doesn't depend on any table existing yet (schema lands in Module 1).
    supabase.auth.getSession().then(({ error }) => {
      if (error) {
        console.error('Supabase connection error:', error.message)
        setStatus('error')
      } else {
        console.log('Supabase connection OK')
        setStatus('connected')
      }
    })
  }, [])

  return (
    <section id="center">
      <h1>Expiry Tracker</h1>
      <p>Supabase status: {status}</p>
    </section>
  )
}

export default App
