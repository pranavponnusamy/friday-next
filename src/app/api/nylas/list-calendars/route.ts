import { NextResponse } from 'next/server';
import Nylas from 'nylas';
import { cookies } from 'next/headers';

// Initialize Nylas with configuration
const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY || '',
  apiUri: process.env.NYLAS_API_URI || 'https://api.us.nylas.com',
});

// Define the type for our frontend calendar format
interface FrontendCalendar {
  id: string;
  name: string;
  description: string;
  read_only: boolean;
  location: string;
  timezone: string;
}

// Interface for handling Nylas calendar data sources
interface NylasCalendarBasic {
  id: string;
  name?: string | null;
  description?: string | null;
  readOnly?: boolean;
  location?: string | null;
  timezone?: string | null;
}

export async function GET() {
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
    let calendars: FrontendCalendar[] = [];
    
    if (calendarsResponse && typeof calendarsResponse === 'object' && 'data' in calendarsResponse) {
      // Handle response with data property
      const data = calendarsResponse.data;
      if (Array.isArray(data)) {
        calendars = data.map((calendar: NylasCalendarBasic) => ({
          id: calendar.id,
          name: calendar.name || 'Unnamed Calendar',
          description: calendar.description || '',
          read_only: calendar.readOnly || false,
          location: calendar.location || '',
          timezone: calendar.timezone || 'UTC',
        }));
      }
    } else if (calendarsResponse && Symbol.iterator in Object(calendarsResponse)) {
      // Handle iterable response
      calendars = Array.from(calendarsResponse as Iterable<NylasCalendarBasic>).map((calendar: NylasCalendarBasic) => ({
        id: calendar.id,
        name: calendar.name || 'Unnamed Calendar',
        description: calendar.description || '',
        read_only: calendar.readOnly || false,
        location: calendar.location || '',
        timezone: calendar.timezone || 'UTC',
      }));
    } else if (Array.isArray(calendarsResponse)) {
      // Handle array response directly
      calendars = (calendarsResponse as NylasCalendarBasic[]).map((calendar) => ({
        id: calendar.id,
        name: calendar.name || 'Unnamed Calendar',
        description: calendar.description || '',
        read_only: calendar.readOnly || false,
        location: calendar.location || '',
        timezone: calendar.timezone || 'UTC',
      }));
    }
    
    return NextResponse.json({
      success: true,
      calendars,
    });
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error fetching calendars:", error);
    return NextResponse.json({ error: `Failed to fetch calendars: ${errorMessage}` }, { status: 500 });
  }
}
