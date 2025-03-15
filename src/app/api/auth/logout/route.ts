import { NextResponse } from 'next/server';

export async function GET() {
  // The Clear-Site-Data header is the most important part for logout
  // This will instruct the browser to clear all client-side data
  
  // For server-side cookies, we'll use the response cookies to set expiration
  const response = new NextResponse(
    JSON.stringify({ success: true }),
    {
      status: 200,
      headers: {
        'Clear-Site-Data': '"cookies", "storage", "cache"',
        'Content-Type': 'application/json'
      }
    }
  );
  
  // Get the names of cookies we know we want to clear
  const cookiesToClear = [
    'nylasGrantId',
    'nylasUserEmail', 
    'cachedEmails',
    'userEmail'
  ];
  
  // For each cookie, set it to expire in the past in the response
  cookiesToClear.forEach(name => {
    response.cookies.set({
      name,
      value: '',
      expires: new Date(0),
      path: '/'
    });
  });
  
  return response;
}
