import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// API endpoint to receive and store user email
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    
    console.log("Received email in API:", email);
    
    if (!email) {
      return NextResponse.json({ error: 'No email provided' }, { status: 400 });
    }
    
    // Get the cookie store
    const cookieStore = await cookies();
    
    // Set cookies with different keys to ensure it's available
    await cookieStore.set('userEmail', email, {
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      httpOnly: true,
      sameSite: 'lax'
    });
    
    await cookieStore.set('email', email, {
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      httpOnly: true,
      sameSite: 'lax'
    });
    
    // Also store in nylasUserEmail for compatibility
    await cookieStore.set('nylasUserEmail', email, {
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      httpOnly: true,
      sameSite: 'lax'
    });
    
    // Store the email in process.env for server-side access
    if (process.env.NODE_ENV !== 'production') {
      // Only do this in development
      process.env.EMAIL = email;
      console.log("Set process.env.EMAIL to:", email);
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Email stored successfully'
    });
  } catch (error) {
    console.error('Error storing email:', error);
    return NextResponse.json({ 
      error: 'Failed to store email'
    }, { status: 500 });
  }
}

// API endpoint to retrieve the stored email
export async function GET() {
  try {
    const cookieStore = await cookies();
    
    // Try to get email from various cookie keys
    const email = 
      cookieStore.get('userEmail')?.value || 
      cookieStore.get('email')?.value || 
      cookieStore.get('nylasUserEmail')?.value || 
      process.env.EMAIL || 
      '';
    
    if (!email) {
      return NextResponse.json({ 
        error: 'No email found' 
      }, { status: 404 });
    }
    
    return NextResponse.json({ email });
  } catch (error) {
    console.error('Error retrieving email:', error);
    return NextResponse.json({ 
      error: 'Failed to retrieve email'
    }, { status: 500 });
  }
}
