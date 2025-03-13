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
    // Get cookies to check for Nylas grant ID
    const cookieStore = await cookies();
    const grantId = cookieStore.get('nylasGrantId')?.value;
    
    if (!grantId) {
      console.log("No Nylas grant ID found");
      return NextResponse.json({ error: 'Not authenticated with Nylas' }, { status: 401 });
    }
    
    console.log("Using grant ID for calendars:", grantId);
    
    // Fetch calendars from Nylas
    const calendarsResponse = await nylas.calendars.list({
      identifier: grantId,
      queryParams: {
        limit: 5, // Get first 5 calendars as requested
      },
    });
    
    // Process the response to extract calendar info
    let calendars = [];
    
    if (calendarsResponse && typeof calendarsResponse === 'object' && 'data' in calendarsResponse) {
      // Handle response with data property
      const data = calendarsResponse.data;
      if (Array.isArray(data)) {
        calendars = data.map(calendar => ({
          id: calendar.id,
          name: calendar.name || 'Unnamed Calendar',
          description: calendar.description || '',
          read_only: calendar.read_only || false,
          location: calendar.location || '',
          timezone: calendar.timezone || 'UTC',
        }));
      }
    } else if (calendarsResponse && Symbol.iterator in Object(calendarsResponse)) {
      // Handle iterable response
      calendars = Array.from(calendarsResponse as Iterable<any>).map(calendar => ({
        id: calendar.id,
        name: calendar.name || 'Unnamed Calendar',
        description: calendar.description || '',
        read_only: calendar.read_only || false,
        location: calendar.location || '',
        timezone: calendar.timezone || 'UTC',
      }));
    } else if (Array.isArray(calendarsResponse)) {
      // Handle array response directly
      calendars = calendarsResponse.map(calendar => ({
        id: calendar.id,
        name: calendar.name || 'Unnamed Calendar',
        description: calendar.description || '',
        read_only: calendar.read_only || false,
        location: calendar.location || '',
        timezone: calendar.timezone || 'UTC',
      }));
    }
    
    if (calendars.length === 0) {
      console.log("No calendars found");
      return NextResponse.json({ 
        message: 'No calendars found',
        calendars: [] 
      });
    }
    
    console.log(`Found ${calendars.length} calendars`);
    return NextResponse.json({ calendars });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error fetching calendars from Nylas:", error);
    return NextResponse.json({ error: `Failed to fetch calendars: ${errorMessage}` }, { status: 500 });
  }
}
