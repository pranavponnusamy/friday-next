/**
 * Utility functions for managing user email across the application
 */

// Store email in localStorage and dispatch an event
export const storeUserEmail = (email: string): void => {
  if (!email) return;
  
  // Store in localStorage
  localStorage.setItem('userEmail', email);
  
  // Dispatch event for components to know email was updated
  const event = new CustomEvent('userEmailUpdated', { 
    detail: { email } 
  });
  window.dispatchEvent(event);
  
  console.log(`Stored user email: ${email}`);
};

// Get email from various possible locations
export const getUserEmail = (): string => {
  if (typeof window === 'undefined') return '';
  
  // Try localStorage first
  const emailFromLocalStorage = localStorage.getItem('userEmail');
  if (emailFromLocalStorage) return emailFromLocalStorage;
  
  // Check cookies
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'userEmail' || name === 'nylasUserEmail') {
      // Store in localStorage for future use
      localStorage.setItem('userEmail', value);
      return value;
    }
  }
  
  // Check Nylas grant ID cookie which might contain email
  const nylasGrantCookie = cookies.find(c => c.trim().startsWith('nylasGrantId='));
  if (nylasGrantCookie) {
    const grantValue = nylasGrantCookie.split('=')[1];
    if (grantValue && grantValue.includes('@')) {
      // Store in localStorage for future use
      localStorage.setItem('userEmail', grantValue);
      return grantValue;
    }
  }
  
  return '';
};

// Script to initialize email from cookies on page load
export const initializeUserEmail = (): void => {
  if (typeof window === 'undefined') return;
  
  // Try to get email when the page loads
  const email = getUserEmail();
  if (email) {
    console.log('Initialized user email:', email);
  }
  
  // Set up a listener for when cookies change
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const refreshedEmail = getUserEmail();
      if (refreshedEmail && refreshedEmail !== localStorage.getItem('userEmail')) {
        storeUserEmail(refreshedEmail);
      }
    }
  });
};
