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
      redirectUri: process.env.NYLAS_REDIRECT_URI || 'https://friday-next-pink.vercel.app/',
    });
    
    console.log("Code exchange response:", JSON.stringify(codeExchangeResponse, null, 2));
    
    if (!codeExchangeResponse || !codeExchangeResponse.grantId) {
      console.error("Failed to exchange code for token", codeExchangeResponse);
      return NextResponse.json({ error: 'Failed to authenticate with Nylas' }, { status: 500 });
    }
    
    // No need to fetch extra user info - just use the email from the response if available
    // Set a placeholder email if not available in the response
    const userEmail = 'nylas-user@example.com';
    
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
    
    // Redirect to the homepage
    return NextResponse.redirect(new URL('/', request.url));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error in Nylas callback:", error);
    return NextResponse.json({ error: `Authentication failed: ${errorMessage}` }, { status: 500 });
  }
}
