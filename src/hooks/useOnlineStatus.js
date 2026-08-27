import { useEffect, useState } from 'react'

/**
 * Tracks connectivity via navigator.onLine plus the online/offline events.
 *
 * Worth knowing what this actually promises: navigator.onLine only reports
 * whether the device has *a* network interface up. A phone on wifi with no
 * internet behind it still reads as online. So treat a false value as
 * definitely offline, and a true value as merely probably online -- which is
 * why requests still need their own error handling rather than trusting this.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
