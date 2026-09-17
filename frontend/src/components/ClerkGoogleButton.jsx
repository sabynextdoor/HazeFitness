import { useEffect, useRef, useState } from 'react';
import { useClerk, useAuth } from '@clerk/react';

export default function ClerkGoogleButton({ onNotice }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const clerk = useClerk();
  const [started, setStarted] = useState(false);
  const exchanged = useRef(false);

  // Only exchange the Clerk session AFTER the user explicitly clicks the
  // button and finishes signing in. This stops the login page from
  // auto-logging the visitor in on every visit.
  useEffect(() => {
    if (!started || !isLoaded || !isSignedIn || exchanged.current) return;
    exchanged.current = true;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/auth/clerk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Sign-in failed. Try again.');
        window.location.href = data.redirect || '/dashboard';
      } catch (err) {
        exchanged.current = false;
        onNotice?.(err.message);
      }
    })();
  }, [started, isLoaded, isSignedIn, getToken]);

  return (
    <button
      type="button"
      className="lx-google lx-gbtn"
      style={{ '--i': 9 }}
      onClick={() => {
        setStarted(true);
        clerk.openSignIn();
      }}
      disabled={!isLoaded}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.59-5.17 3.59-8.81z" />
        <path fill="#34A853" d="M12 24c3.25 0 5.98-1.07 7.97-2.91l-3.88-3a7.06 7.06 0 0 1-4.09 1.2c-2.7 0-4.99-1.82-5.8-4.28H3.2v3.11A11.99 11.99 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M6.2 14.01a7.2 7.2 0 0 1 0-4.61V6.29H3.2a11.96 11.96 0 0 0 0 10.83l3-2.11z" />
        <path fill="#EA4335" d="M12 4.62c1.77 0 3.36.61 4.61 1.8l3.45-3.44A11.96 11.96 0 0 0 3.2 6.29l3 3.11C7.01 6.44 9.3 4.62 12 4.62z" />
      </svg>
      <span>Continue with Google</span>
    </button>
  );
}