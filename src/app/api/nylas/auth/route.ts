import { NextResponse } from 'next/server';
import Nylas from 'nylas';

// Log environment variables for debugging 
console.log('NYLAS_CLIENT_ID:', process.env.NYLAS_CLIENT_ID);
console.log('NYLAS_REDIRECT_URI:', process.env.NYLAS_REDIRECT_URI);

// Initialize Nylas with configuration
const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY || '',
  apiUri: process.env.NYLAS_API_URI || 'https://api.us.nylas.com',
});

export async function GET() {
  try {
    // Ensure client ID is available
    const clientId = process.env.NYLAS_CLIENT_ID;
    if (!clientId) {
      console.error("Missing NYLAS_CLIENT_ID environment variable");
      return NextResponse.json({ error: 'Missing client ID configuration' }, { status: 500 });
    }

    // Generate the authorization URL
    const authUrl = nylas.auth.urlForOAuth2({
      clientId: clientId,
      redirectUri: process.env.NYLAS_REDIRECT_URI || 'http://localhost:3000/api/nylas/callback',
      scope: ['email.read_only', 'email.drafts', 'calendar', 'contacts'],
    });

    console.log('Generated auth URL:', authUrl);

    // Redirect the user to the authorization URL
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("Error generating authorization URL:", error);
    return NextResponse.json({ error: 'Failed to generate authorization URL' }, { status: 500 });
  }
}
