import { NextRequest, NextResponse } from 'next/server';
import Nylas from 'nylas';
import { cookies } from 'next/headers';

// Initialize Nylas with configuration
const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY || '',
  apiUri: process.env.NYLAS_API_URI || 'https://api.us.nylas.com',
});

interface Task {
  description: string;
  deadline: string | null;
  task_type: 'meeting_scheduling' | 'reminder' | 'to_do_item';
  priority: number;
  context: string;
}

interface CreateEventRequest {
  task: Task;
  calendarId: string;
}

export async function POST(request: NextRequest) {
  try {
    // Get cookies to check for Nylas grant ID
    const cookieStore = await cookies();
    const grantId = cookieStore.get('nylasGrantId')?.value;
    
    if (!grantId) {
      console.log("No Nylas grant ID found");
      return NextResponse.json({ error: 'Not authenticated with Nylas' }, { status: 401 });
    }
    
    // Parse request body
    const requestData: CreateEventRequest = await request.json();
    const { task, calendarId } = requestData;
    
    if (!task || !calendarId) {
      return NextResponse.json({ error: 'Missing task or calendarId' }, { status: 400 });
    }
    
    console.log("Creating event for task:", task.description, "on calendar:", calendarId);
    
    // Determine event time based on deadline
    let startTime = Math.floor(Date.now() / 1000); // Default to now
    let endTime = startTime + 3600; // Default to 1 hour duration
    
    // If there's a deadline, try to parse it
    if (task.deadline) {
      try {
        // Try to parse deadline as a date string
        const deadlineDate = new Date(task.deadline);
        if (!isNaN(deadlineDate.getTime())) {
          // Use the deadline as the end time
          endTime = Math.floor(deadlineDate.getTime() / 1000);
          // Set start time to 1 hour before end time
          startTime = endTime - 3600;
        }
      } catch (parseError) {
        console.warn("Could not parse deadline date:", task.deadline);
        // Keep using default times
      }
    }
    
    // Build event title and description based on task
    const eventTitle = task.description;
    let eventDescription = '';
    
    if (task.context) {
      eventDescription += task.context + '\n\n';
    }
    
    eventDescription += `Priority: ${task.priority}/5\n`;
    eventDescription += `Type: ${task.task_type.replace('_', ' ')}`;
    
    // Create the event in Nylas
    const event = await nylas.events.create({
      identifier: grantId,
      requestBody: {
        title: eventTitle,
        description: eventDescription,
        when: {
          startTime: startTime,
          endTime: endTime,
        },
        busy: true,
        // Set calendar color based on priority
        color: getPriorityColor(task.priority),
      },
      queryParams: {
        calendarId: calendarId,
      },
    });
    
    return NextResponse.json({ 
      success: true, 
      message: 'Event created successfully',
      event 
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error creating event:", error);
    return NextResponse.json({ error: `Failed to create event: ${errorMessage}` }, { status: 500 });
  }
}

// Helper function to get color based on task priority
function getPriorityColor(priority: number): string {
  switch(priority) {
    case 5: return '#D32F2F'; // Red for highest priority
    case 4: return '#F57C00'; // Orange
    case 3: return '#FFC107'; // Amber/Yellow
    case 2: return '#2196F3'; // Blue
    case 1: 
    default: return '#4CAF50'; // Green for lowest priority
  }
}
