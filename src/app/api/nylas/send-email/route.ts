import { NextRequest, NextResponse } from 'next/server';
import Nylas from 'nylas';
import { cookies } from 'next/headers';

// Initialize Nylas with configuration
const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY || '',
  apiUri: process.env.NYLAS_API_URI || 'https://api.us.nylas.com',
});

interface SendEmailRequest {
  subject: string;
  body: string;
  to: {
    name: string;
    email: string;
  }[];
  replyToMessageId?: string;
}

// Define the request body type for Nylas messages.send
interface SendMessageRequest {
  subject: string;
  body: string;
  to: {
    name: string;
    email: string;
  }[];
  replyToMessageId?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const { subject, body, to, replyToMessageId } = await request.json() as SendEmailRequest;
    
    // Validate request
    if (!subject || !body || !to || !Array.isArray(to) || to.length === 0) {
      return NextResponse.json({ 
        error: 'Invalid request. Must include subject, body, and to recipient(s)' 
      }, { status: 400 });
    }
    
    // Get grant ID from cookies
    const cookieStore = await cookies();
    const grantId = cookieStore.get('nylasGrantId')?.value;
    
    if (!grantId) {
      return NextResponse.json(
        { error: 'Nylas authentication required' },
        { status: 401 }
      );
    }
    
    // Prepare request body
    const requestBody: SendMessageRequest = {
      subject,
      body,
      to,
    };
    
    // Add replyToMessageId if it exists
    if (replyToMessageId) {
      requestBody.replyToMessageId = replyToMessageId;
    }
    
    // Send email using Nylas
    console.log('Sending email with Nylas:', {
      ...requestBody,
      body: body.substring(0, 100) + (body.length > 100 ? '...' : '') // Log truncated body
    });
    
    const result = await nylas.messages.send({
      identifier: grantId,
      requestBody: requestBody
    });
    
    return NextResponse.json({
      success: true,
      message: 'Email sent successfully',
      data: result.data
    });
    
  } catch (error) {
    console.error('Error sending email:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to send email: ${errorMessage}` }, { status: 500 });
  }
}
