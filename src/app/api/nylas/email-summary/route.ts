import { NextRequest, NextResponse } from 'next/server';
import Nylas from 'nylas';
import { cookies } from 'next/headers';

// Define email interface to improve type safety
interface NylasEmail {
  id: string;
  subject: string;
  from: { email: string; name: string }[];
  date: number;
  body: string;
  starred?: boolean;
  unread?: boolean;
  folders?: string[];
  threadId?: string;
  [key: string]: unknown; // Allow for other properties from Nylas
}

// Initialize Nylas with configuration
const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY || '',
  apiUri: process.env.NYLAS_API_URI || 'https://api.us.nylas.com',
});

// Process a single email independently - allows for parallel processing
async function processEmail(email: NylasEmail, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  grantId: string): Promise<NylasEmail> {
  try {
    // You could add additional processing logic here if needed
    return email;
  } catch (error) {
    console.error(`Error processing email ${email.id}:`, error);
    return email; // Return the original email if processing fails
  }
}

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
      let emails: NylasEmail[] = [];
      
      // Using a more TypeScript-friendly approach for handling async responses
      try {
        // Increased limit to 20 emails
        const messagesResponse = await nylas.messages.list({
          identifier: grantId,
          queryParams: {
            limit: 20, // Increased from 10 to 20 for more preloading
          },
        });
        
        // Check if it's a paginated response with data property
        if (messagesResponse && typeof messagesResponse === 'object' && 'data' in messagesResponse) {
          const rawEmails = messagesResponse.data as unknown as NylasEmail[];
          console.log(`Successfully fetched ${rawEmails.length} emails from data property`);
          
          // Process emails in parallel using Promise.all
          emails = await Promise.all(
            rawEmails.map(email => processEmail(email, grantId))
          );
          
          // Print out the first email for debugging
          if (emails.length > 0) {
            console.log("Sample email (first in the list):");
            console.log(JSON.stringify(emails[0], null, 2));
          }
        } else {
          // Try to handle it as an async iterable manually - collecting all emails first
          const tempEmails: NylasEmail[] = [];
          
          try {
            // @ts-expect-error - Working around TypeScript errors with the iterator
            for await (const message of messagesResponse) {
              tempEmails.push(message as unknown as NylasEmail);
              
              // Stop after collecting 20 emails
              if (tempEmails.length >= 20) break;
            }
            
            if (tempEmails.length > 0) {
              // Process emails in parallel
              emails = await Promise.all(
                tempEmails.map(email => processEmail(email, grantId))
              );
              
              console.log(`Successfully fetched and processed ${emails.length} emails via iteration`);
              
              // Print out the first email for debugging
              console.log("Sample email (first in the list):");
              console.log(JSON.stringify(emails[0], null, 2));
            }
          } catch (iterError) {
            console.warn("Iterator approach failed:", iterError);
            
            // Last attempt - check if it's directly an array
            if (Array.isArray(messagesResponse)) {
              const rawEmails = (messagesResponse as unknown as NylasEmail[]).slice(0, 20);
              
              // Process emails in parallel
              emails = await Promise.all(
                rawEmails.map(email => processEmail(email, grantId))
              );
              
              console.log(`Successfully fetched and processed ${emails.length} emails from array response`);
              
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
      
      // Store emails in cookies for future use with increased expiry
      cookieStore.set('cachedEmails', JSON.stringify(emails), { 
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 2 // 2 hours (increased from 1 hour)
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error("Error calling Nylas API:", error);
      
      // Fallback to mock emails if we can't get real emails
      const mockEmails = [
        {
          id: '1',
          subject: 'Welcome to the Email Summary App',
          from: [{ email: 'demo@example.com', name: 'Demo User' }],
          date: Date.now() / 1000,
          body: '<p>This is a mock email because we could not fetch your real emails. Please check your Nylas authentication.</p>'
        },
        {
          id: '2',
          subject: 'How to Use This App',
          from: [{ email: 'support@example.com', name: 'Support Team' }],
          date: Date.now() / 1000,
          body: '<p>Navigate through your emails using the Next and Previous buttons. The AI will summarize each email for you.</p>'
        }
      ];
      
      // Get the email index from the query params, defaulting to 0
      const searchParams = request.nextUrl.searchParams;
      const emailIndex = parseInt(searchParams.get('index') || '0', 10);
      const safeIndex = emailIndex % mockEmails.length;
      
      // Return a mock email with an error message
      return NextResponse.json({
        email: mockEmails[safeIndex],
        error: `Failed to fetch emails: ${errorMessage}`,
        currentIndex: safeIndex,
        totalEmails: mockEmails.length,
        isMock: true
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Unhandled error in email-summary API route:", error);
    return NextResponse.json({ error: `Failed to retrieve emails: ${errorMessage}` }, { status: 500 });
  }
}
