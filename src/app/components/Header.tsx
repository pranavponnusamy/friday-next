'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';

export default function Header() {
  const [userEmail, setUserEmail] = useState<string>('');
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Function to retrieve email from various sources
    const getUserEmail = () => {
      // Check localStorage first
      const storedEmail = localStorage.getItem('userEmail');
      if (storedEmail) {
        setUserEmail(storedEmail);
        return;
      }

      // Check cookies if localStorage doesn't have it
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'userEmail' || name === 'nylasUserEmail') {
          setUserEmail(value);
          // Also store in localStorage for future use
          localStorage.setItem('userEmail', value);
          return;
        }
      }
    };

    getUserEmail();

    // Listen for a custom event that might be triggered when email is updated
    const handleEmailUpdate = (event: CustomEvent<{ email: string }>) => {
      if (event.detail && event.detail.email) {
        setUserEmail(event.detail.email);
        localStorage.setItem('userEmail', event.detail.email);
      }
    };

    window.addEventListener('userEmailUpdated' as keyof WindowEventMap, handleEmailUpdate as EventListener);

    return () => {
      window.removeEventListener('userEmailUpdated' as keyof WindowEventMap, handleEmailUpdate as EventListener);
    };
  }, []);

  // Handle logout button click
  const handleLogout = async () => {
    try {
      // Call the logout API endpoint that sets Clear-Site-Data header
      const response = await fetch('/api/auth/logout', {
        method: 'GET',
        credentials: 'include' // Include cookies with the request
      });
      
      if (response.ok) {
        // Even though Clear-Site-Data header should clear localStorage,
        // we'll also do it here for older browsers that don't support the header
        localStorage.clear();
        
        // Reset user email state
        setUserEmail('');
        
        // Redirect to home page
        router.push('/');
        
        // Force a page reload to ensure everything is cleared
        setTimeout(() => {
          window.location.href = '/';
        }, 100);
      } else {
        console.error('Logout failed:', response.statusText);
        // Fallback to client-side logout
        localStorage.clear();
        document.cookie.split(';').forEach(cookie => {
          const [name] = cookie.trim().split('=');
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        });
        setUserEmail('');
        router.push('/');
      }
    } catch (error) {
      console.error('Error during logout:', error);
      // Fallback to client-side logout
      localStorage.clear();
      document.cookie.split(';').forEach(cookie => {
        const [name] = cookie.trim().split('=');
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      });
      setUserEmail('');
      router.push('/');
    }
  };

  return (
    <header className="bg-white shadow-sm">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="text-xl font-bold text-indigo-600">
                Friday
              </Link>
            </div>
            <nav className="ml-6 flex space-x-4">
              <Link
                href="/"
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  pathname === '/' 
                    ? 'bg-indigo-100 text-indigo-700' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
              >
                Home
              </Link>
              <Link
                href="/email-summary"
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  pathname === '/email-summary' 
                    ? 'bg-indigo-100 text-indigo-700' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
              >
                Email Summary
              </Link>
            </nav>
          </div>
          <div className="flex items-center">
            {userEmail ? (
              <div className="flex items-center">
                <div className="mr-3 text-sm text-gray-500">
                  <span>Signed in as </span>
                  <span className="font-semibold text-gray-700">{decodeURIComponent(userEmail)}</span>
                </div>
                <Image
                  className="h-8 w-8 rounded-full bg-gray-200"
                  src={`https://www.gravatar.com/avatar/${Buffer.from(decodeURIComponent(userEmail)).toString('hex')}?d=identicon`}
                  alt="User avatar"
                  width={32}
                  height={32}
                />
                <button
                  onClick={handleLogout}
                  className="ml-4 px-3 py-1 rounded-md text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                >
                  Log out
                </button>
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                Not signed in
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
