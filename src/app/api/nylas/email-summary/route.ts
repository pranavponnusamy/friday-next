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
    const cookieStore = await cookies();
    const grantId = cookieStore.get('nylasGrantId')?.value;
    
    if (!grantId) {
      return NextResponse.json({ error: 'Not authenticated with Nylas' }, { status: 401 });
    }
    
    console.log("Using grant ID:", grantId);
    
    // Use the Nylas SDK to fetch emails, just like in the Express app
    try {
      // First try to use the SDK to fetch emails
      let emails = [];
      
      // Using a more TypeScript-friendly approach for handling async responses
      try {
        const messagesResponse = await nylas.messages.list({
          identifier: grantId,
          queryParams: {
            limit: 10,
          },
        });
        
        // Check if it's a paginated response with data property
        if (messagesResponse && 'data' in messagesResponse) {
          emails = messagesResponse.data;
          console.log(`Successfully fetched ${emails.length} emails from data property`);
          
          // Print out the first email for debugging
          if (emails.length > 0) {
            console.log("Sample email (first in the list):");
            console.log(JSON.stringify(emails[0], null, 2));
          }
        } else {
          // Try to handle it as an async iterable manually
          const tempEmails: any[] = [];
          
          // Using a try-catch to handle potential iterator issues
          try {
            // @ts-ignore - Working around TypeScript errors with the iterator
            for await (const message of messagesResponse) {
              tempEmails.push(message);
            }
            
            if (tempEmails.length > 0) {
              emails = tempEmails;
              console.log(`Successfully fetched ${emails.length} emails via iteration`);
              
              // Print out the first email for debugging
              console.log("Sample email (first in the list):");
              console.log(JSON.stringify(emails[0], null, 2));
            }
          } catch (iterError) {
            console.warn("Iterator approach failed:", iterError);
            
            // Last attempt - check if it's directly an array
            if (Array.isArray(messagesResponse)) {
              emails = messagesResponse;
              console.log(`Successfully fetched ${emails.length} emails from array response`);
              
              // Print out the first email for debugging
              if (emails.length > 0) {
                console.log("Sample email (first in the list):");
                console.log(JSON.stringify(emails[0], null, 2));
              }
            }
          }
        }
      } catch (fetchError) {
        console.error("Error fetching messages:", fetchError);
        throw fetchError; // Re-throw to trigger fallback
      }
      
      // If we couldn't get any emails using the SDK approaches, throw an error
      if (emails.length === 0) {
        throw new Error("Could not retrieve any emails");
      }
      
      // Store emails in cookies for future use
      cookieStore.set('cachedEmails', JSON.stringify(emails), { 
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 1 // 1 hour
      });
      
      // Get the email index from the query params
      const searchParams = request.nextUrl.searchParams;
      const emailIndex = parseInt(searchParams.get('index') || '0', 10);
      
      if (emailIndex < 0 || emailIndex >= emails.length) {
        return NextResponse.json({ error: 'Invalid email index' }, { status: 400 });
      }
      
      const email = emails[emailIndex];
      
      // Return the email data
      return NextResponse.json({
        email: email,
        currentIndex: emailIndex,
        totalEmails: emails.length
      });
    } catch (apiError: any) {
      console.error("Error calling Nylas API:", apiError);
      
      // Fallback to mock emails if we can't get real emails
      const mockEmails = [
        {
          id: '1',
          subject: 'Meeting Tomorrow at 2pm',
          from: [{ name: 'John Doe', email: 'john@example.com' }],
          date: Math.floor(Date.now() / 1000),
          body: `Hi there,\n\nLet's have a meeting tomorrow at 2pm to discuss the project timeline. Please prepare a status update.\n\nBest regards,\nJohn`
        },
        {
          id: '2',
          subject: 'Action Items from Yesterday',
          from: [{ name: 'Alice Smith', email: 'alice@example.com' }],
          date: Math.floor(Date.now() / 1000) - 86400,
          body: `Hello,\n\nFollowing up on our discussion yesterday, here are the action items:\n\n1. Submit the quarterly report by Friday\n2. Schedule a call with the client next week\n3. Review the marketing materials\n\nThanks,\nAlice`
        },
        {
          id: '3',
          subject: 'Reminder: Team Lunch',
          from: [{ name: 'Bob Johnson', email: 'bob@example.com' }],
          date: Math.floor(Date.now() / 1000) - 43200,
          body: `Team,\n\nJust a reminder that we have our team lunch tomorrow at 12pm at the Italian restaurant.\n\nSee you all there!\nBob`
        }
      ];
      
      // Print out the first mock email for debugging
      console.log("Using mock email data. Sample email:");
      console.log(JSON.stringify(mockEmails[0], null, 2));
      
      // Store mock emails in cookies for future use
      cookieStore.set('cachedEmails', JSON.stringify(mockEmails), { 
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 1 // 1 hour
      });
      
      // Get the email index from the query params
      const searchParams = request.nextUrl.searchParams;
      const emailIndex = parseInt(searchParams.get('index') || '0', 10);
      
      // Return the mock email data
      return NextResponse.json({
        email: mockEmails[emailIndex],
        currentIndex: emailIndex,
        totalEmails: mockEmails.length,
        isMock: true,
        apiError: apiError.message
      });
    }
  } catch (error: any) {
    console.error("Error in email summary:", error);
    return NextResponse.json({ error: `Failed to fetch emails: ${error.message}` }, { status: 500 });
  }
}
