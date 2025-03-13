import { NextRequest, NextResponse } from 'next/server';
import Nylas from 'nylas';
import { cookies } from 'next/headers';

// Initialize Nylas with configuration
const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY || '',
  apiUri: process.env.NYLAS_API_URI || 'https://api.us.nylas.com',
});

export async function POST(request: NextRequest) {
  try {
    // Get cookies to check for Nylas grant ID
    const cookieStore = await cookies();
    const grantId = cookieStore.get('nylasGrantId')?.value;
    
    if (!grantId) {
      console.log("No Nylas grant ID found");
      return NextResponse.json({ error: 'Not authenticated with Nylas' }, { status: 401 });
    }
    
    const requestData = await request.json();
    const { email, startTime, endTime } = requestData;
    
    if (!email || !startTime || !endTime) {
      return NextResponse.json({ 
        error: 'Missing required parameters: email, startTime, and endTime are required' 
      }, { status: 400 });
    }
    
    // Convert startTime and endTime to Unix timestamps if provided as Date objects
    const startUnix = typeof startTime === 'number' ? startTime : Math.floor(new Date(startTime).getTime() / 1000);
    const endUnix = typeof endTime === 'number' ? endTime : Math.floor(new Date(endTime).getTime() / 1000);
    
    // Get free/busy information
    const freeBusyResponse = await nylas.calendars.getFreeBusy({
      identifier: grantId,
      requestBody: {
        startTime: startUnix,
        endTime: endUnix,
        emails: [email]
      }
    });
    
    return NextResponse.json({
      success: true,
      freeBusy: freeBusyResponse
    });
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error getting free/busy info:", error);
    return NextResponse.json({ error: `Failed to get free/busy information: ${errorMessage}` }, { status: 500 });
  }
}
