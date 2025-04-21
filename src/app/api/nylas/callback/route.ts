import { NextRequest, NextResponse } from 'next/server';
import Nylas from 'nylas';
import { cookies } from 'next/headers';

// Initialize Nylas with configuration
const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY || '',
  apiUri: process.env.NYLAS_API_URI || 'https://api.us.nylas.com',
});

export async function GET(request: NextRequest) {
  try {
    // Extract code from query params
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    
    if (!code) {
      return NextResponse.json({ error: 'No authorization code provided' }, { status: 400 });
    }
    
    console.log("Received authorization code:", code);
    
    // Exchange code for access token
    const codeExchangeResponse = await nylas.auth.exchangeCodeForToken({
      clientId: process.env.NYLAS_CLIENT_ID || '',
      clientSecret: process.env.NYLAS_API_KEY || '',
      code,
      redirectUri: process.env.NODE_ENV === 'production' 
        ? 'https://saturday-next-pink.vercel.app/api/nylas/callback'
        : 'http://localhost:3000/api/nylas/callback',
    });
    
    console.log("Code exchange response:", JSON.stringify(codeExchangeResponse, null, 2));
    
    if (!codeExchangeResponse || !codeExchangeResponse.grantId) {
      console.error("Failed to exchange code for token", codeExchangeResponse);
      return NextResponse.json({ error: 'Failed to authenticate with Nylas' }, { status: 500 });
    }
    
    // Get grant info to extract the email
    let userEmail = '';
    try {
      // Make a request to get user account info
      try {
        const accountResponse = await fetch(`${process.env.NYLAS_API_URI}/v3/grants/${codeExchangeResponse.grantId}`, {
          headers: {
            'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });
        
        if (accountResponse.ok) {
          const accountData = await accountResponse.json();
          console.log("Grant info:", JSON.stringify(accountData, null, 2));
          
          if (accountData.data && accountData.data.email) {
            userEmail = accountData.data.email;
            console.log("Found user email from grant API:", userEmail);
          }
        }
      } catch (apiError) {
        console.error("Error making direct API call for grant info:", apiError);
      }
      
      // If we still don't have an email, use a placeholder
      if (!userEmail) {
        userEmail = 'nylas-user@example.com';
        console.warn("No email found, using placeholder");
      }
    } catch (grantError) {
      console.error("Error getting grant details:", grantError);
      userEmail = 'nylas-user@example.com';
    }
    
    console.log("Using email for Nylas user:", userEmail);
    
    // Store grant ID and user email in cookie
    const cookieStore = await cookies();
    cookieStore.set('nylasGrantId', codeExchangeResponse.grantId, { 
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7 // 1 week
    });
    
    cookieStore.set('nylasUserEmail', userEmail, { 
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7 // 1 week
    });
    
    // Store in localStorage as well (accessible from client-side)
    return NextResponse.redirect(new URL('/', request.url), {
      headers: {
        'Set-Cookie': `userEmail=${userEmail}; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error in Nylas callback:", error);
    return NextResponse.json({ error: `Authentication failed: ${errorMessage}` }, { status: 500 });
  }
}
