import { NextRequest, NextResponse } from 'next/server';
import Nylas from 'nylas';
import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
import { upsertTask, ensureCollection } from '@/utils/qdrantClient';

// Initialize Nylas with configuration
const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY || '',
  apiUri: process.env.NYLAS_API_URI || 'https://api.us.nylas.com',
});

// Map task priority to colors
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface CreateCalendarEventRequest {
  task: {
    description: string;
    deadline: string | null;
    task_type: string;
    priority: number;
    context: string;
    duration?: number; // Add duration field to task
  };
  calendarId: string;
  email?: string; // Optional email for free/busy lookup
  timePreference?: {
    startHour: number;
    endHour: number;
    label: string;
  };
  calendarsToConsider?: string[]; // Optional list of calendar IDs to consider
}

// Define the CreateEventRequestWithColor type to include the color property
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface CreateEventRequestWithColor {
  title: string;
  description: string;
  when: {
    startTime: number;
    endTime: number;
  };
  busy: boolean;
  color: string;
}

interface FreeBusyDataItem {
  email: string;
  object: 'free_busy' | 'error';
  time_slots: {
    start_time: number;
    end_time: number;
    status: string;
  }[];
  error?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface GetFreeBusyResponse {
  request_id: string;
  data: FreeBusyDataItem[];
}

// Find free time slots in a day
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function findFreeTimeSlots(
  busySlots: { start_time: number; end_time: number; status: string }[],
  startOfDay: number,
  endOfDay: number,
  durationMinutes: number = 60
): { startTime: number; endTime: number }[] {
  // Sort busy slots by start time
  const sortedBusySlots = [...busySlots].sort((a, b) => a.start_time - b.start_time);
  
  // Create free slots
  const freeSlots: { startTime: number; endTime: number }[] = [];
  let currentTime = startOfDay;
  
  // Duration in seconds
  const duration = durationMinutes * 60;
  
  // Find gaps between busy slots
  for (const slot of sortedBusySlots) {
    if (slot.start_time > currentTime && (slot.start_time - currentTime) >= duration) {
      // We found a free slot
      freeSlots.push({
        startTime: currentTime,
        endTime: currentTime + duration
      });
    }
    currentTime = Math.max(currentTime, slot.end_time);
  }
  
  // Check for a free slot after the last busy slot
  if (endOfDay > currentTime && (endOfDay - currentTime) >= duration) {
    freeSlots.push({
      startTime: currentTime,
      endTime: currentTime + duration
    });
  }
  
  return freeSlots;
}

// Find the next available time slot
async function findNextAvailableSlot(
  grantId: string, 
  email: string,
  durationMinutes: number = 60,
  timePreference?: {
    startHour: number;
    endHour: number;
    label: string;
  },
  calendarsToConsider?: string[]
): Promise<{ startTime: number; endTime: number }> {
  // Round DOWN to the nearest 5-minute interval instead of rounding up
  // This reduces the chance of overlap with existing events
  const now = Math.floor(Date.now() / (5 * 60 * 1000)) * 5 * 60;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const fiveDaysLater = now + (5 * 24 * 60 * 60); // Look up to 5 days ahead
  
  // Default to tomorrow morning at 9 AM if anything fails
  const getDefaultTime = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    
    const defaultStartTime = Math.floor(tomorrow.getTime() / 1000);
    return {
      startTime: defaultStartTime,
      endTime: defaultStartTime + (durationMinutes * 60) // Use actual duration for default time
    };
  };
  
  try {
    console.log(`Getting availability for email: ${email}`);
    console.log(`With time preference: ${timePreference ? timePreference.label : 'None'}`);
    
    // Ensure we have a valid email
    let userEmail = email;
    if (!userEmail || userEmail === 'undefined') {
      // Try to get from environment as fallback
      userEmail = process.env.EMAIL || 'user@example.com';
      console.log(`No email provided, using fallback: ${userEmail}`);
    }
    
    // Decode email if it's URL encoded
    let decodedEmail = userEmail;
    try {
      if (userEmail && userEmail.includes('%')) {
        decodedEmail = decodeURIComponent(userEmail);
        console.log(`Decoded email from "${userEmail}" to "${decodedEmail}"`);
      }
    } catch (e) {
      console.error("Error decoding email:", e);
    }
    
    // First, get all the user's calendars to check availability across all of them
    const calendarsResponse = await nylas.calendars.list({
      identifier: grantId,
      queryParams: {
        limit: 100 // Get all user calendars to check availability
      }
    });
    
    if (!calendarsResponse || !calendarsResponse.data || !Array.isArray(calendarsResponse.data)) {
      console.error("Failed to retrieve user calendars");
      return getDefaultTime();
    }
    
    let calendarsToCheck = calendarsResponse.data;
    if (calendarsToConsider && calendarsToConsider.length > 0) {
      console.log(`Filtering to check only ${calendarsToConsider.length} selected calendars`);
      calendarsToCheck = calendarsResponse.data.filter(cal => 
        calendarsToConsider.includes(cal.id)
      );
    } else {
      console.log(`Checking availability across all ${calendarsResponse.data.length} calendars`);
    }
    
    const userCalendars = calendarsToCheck;
    // Use type assertion to avoid TypeScript errors while still improving on 'any'
    const calendarIds = userCalendars.map((cal) => cal.id as string);
    
    console.log(`Found ${calendarIds.length} calendars to check for conflicts`);
    
    // Calculate start and end time
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    const fiveDaysLater = now + (5 * 24 * 60 * 60); // 5 days from now in seconds
    
    // Round startTime to the nearest 5-minute interval
    const roundedStartTime = Math.floor(now / 300) * 300; // 300 seconds = 5 minutes
    
    // Ensure the end time is also a multiple of 5 minutes
    const roundedEndTime = Math.floor(fiveDaysLater / 300) * 300;
    
    console.log(`Using rounded start time: ${new Date(roundedStartTime * 1000).toISOString()} (${roundedStartTime})`);
    
    // Use the getAvailability API with all calendar IDs for the participant
    const availabilityResponse = await nylas.calendars.getAvailability({
      requestBody: {
        startTime: roundedStartTime,
        endTime: roundedEndTime,
        participants: [{ 
          email: decodedEmail,
          calendarIds: calendarIds
        }],
        durationMinutes: durationMinutes,
        intervalMinutes: 5,
        roundTo30Minutes: false
      }
    });
    
    console.log("Availability response received:", JSON.stringify(availabilityResponse, null, 2).substring(0, 200) + "...");
    
    // Define a type for our time slots
    interface TimeSlot {
      startTime: number;
      endTime: number;
    }
    
    // Check if we got time slots back
    if (availabilityResponse && availabilityResponse.data && 
        availabilityResponse.data.timeSlots && 
        availabilityResponse.data.timeSlots.length > 0) {
      
      // Convert response time slots to ensure we have numbers
      // Use type assertion to avoid TypeScript errors while still improving on 'any'
      const timeSlots: TimeSlot[] = availabilityResponse.data.timeSlots.map((slot) => ({
        startTime: Number(slot.startTime),
        endTime: Number(slot.endTime)
      }));
      
      console.log(`Found ${timeSlots.length} available time slots`);
      
      // Log a few time slots to see what's available
      if (timeSlots.length > 0) {
        console.log("Sample of available time slots:");
        timeSlots.slice(0, Math.min(5, timeSlots.length)).forEach((slot, index) => {
          const startTime = new Date(slot.startTime * 1000);
          console.log(`Slot ${index}: ${startTime.toLocaleString()} (${startTime.getHours()}:${startTime.getMinutes()})`);
        });
      }
      
      // Filter time slots based on time preference if provided
      let filteredTimeSlots = timeSlots;
      
      if (timePreference && timePreference.startHour !== 0 && timePreference.endHour !== 24) {
        // Convert the time preference hours to seconds since epoch for today and future days
        filteredTimeSlots = timeSlots.filter((slot) => {
          const slotDate = new Date(slot.startTime * 1000);
          const hours = slotDate.getHours();
          const mins = slotDate.getMinutes();
          
          // More precise time check - we need to check if the slot starts within the time range
          const slotTimeInMins = hours * 60 + mins;
          const preferredStartInMins = timePreference.startHour * 60;
          const preferredEndInMins = timePreference.endHour * 60;
          
          return slotTimeInMins >= preferredStartInMins && slotTimeInMins < preferredEndInMins;
        });
        
        console.log(`Filtered to ${filteredTimeSlots.length} slots based on time preference (${timePreference.startHour}:00-${timePreference.endHour}:00)`);
        
        // Log filtered slots
        if (filteredTimeSlots.length > 0) {
          console.log("Filtered time slots:");
          filteredTimeSlots.slice(0, Math.min(5, filteredTimeSlots.length)).forEach((slot, index) => {
            const startTime = new Date(slot.startTime * 1000);
            console.log(`Filtered slot ${index}: ${startTime.toLocaleString()} (${startTime.getHours()}:${startTime.getMinutes()})`);
          });
          
          // If no slots match the preference, fall back to all slots
          if (filteredTimeSlots.length === 0) {
            console.log("No slots match time preference, falling back to all available slots");
            filteredTimeSlots = timeSlots;
          }
        }
      }
      
      // Get today's timestamp boundaries (using local time zone to ensure accuracy)
      const todayDate = new Date();
      const startOfToday = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate()).getTime() / 1000;
      const endOfToday = startOfToday + (24 * 60 * 60) - 1;
      
      console.log(`Today's boundaries: ${new Date(startOfToday * 1000).toLocaleString()} to ${new Date(endOfToday * 1000).toLocaleString()}`);
      
      // Separate today's slots from future slots
      const allTodaySlots = timeSlots.filter(slot => 
        slot.startTime >= Math.max(now, startOfToday) && 
        slot.endTime <= endOfToday
      );
      
      console.log(`Found ${allTodaySlots.length} available slots for TODAY (any time)`);
      
      // Log ALL of today's slots for thorough debugging
      if (allTodaySlots.length > 0) {
        console.log("All available slots for TODAY:");
        allTodaySlots.forEach((slot, index) => {
          const startTime = new Date(slot.startTime * 1000);
          console.log(`Today's slot ${index}: ${startTime.toLocaleString()} (${startTime.getHours()}:${startTime.getMinutes()})`);
        });
      }
      
      // Try to find any slot today within the user's preferred time range
      if (filteredTimeSlots.length > 0) {
        // We have slots today! Sort them to get the earliest one
        filteredTimeSlots.sort((a, b) => a.startTime - b.startTime);
        const selectedSlot = filteredTimeSlots[0];
        const slotTime = new Date(selectedSlot.startTime * 1000);
        
        console.log(`Using today's preferred slot at ${slotTime.toLocaleTimeString()} (${slotTime.getHours()}:${slotTime.getMinutes()})`);
        return {
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime
        };
      }
      
      // Check if we have a time preference and should look at the next day
      if (timePreference && timePreference.startHour !== 0 && timePreference.endHour !== 24) {
        console.log("No slots available today in preferred time range, checking next day for preferred time slots");
        
        // Get tomorrow's timestamp boundaries
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const startOfTomorrow = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate()).getTime() / 1000;
        const endOfTomorrow = startOfTomorrow + (24 * 60 * 60) - 1;
        
        console.log(`Tomorrow's boundaries: ${new Date(startOfTomorrow * 1000).toLocaleString()} to ${new Date(endOfTomorrow * 1000).toLocaleString()}`);
        
        // Filter for tomorrow's slots within preferred time range
        const tomorrowFilteredSlots = filteredTimeSlots.filter((slot) => 
          slot.startTime >= startOfTomorrow && 
          slot.endTime <= endOfTomorrow
        );
        
        console.log(`Found ${tomorrowFilteredSlots.length} available slots TOMORROW within the preferred time range`);
        
        // Log tomorrow's filtered slots
        if (tomorrowFilteredSlots.length > 0) {
          console.log("All of tomorrow's slots matching the time preference:");
          tomorrowFilteredSlots.forEach((slot, index) => {
            const startTime = new Date(slot.startTime * 1000);
            console.log(`Tomorrow's preferred slot ${index}: ${startTime.toLocaleString()} (${startTime.getHours()}:${startTime.getMinutes()})`);
          });
          
          // Sort to get the earliest preferred slot tomorrow
          tomorrowFilteredSlots.sort((a, b) => a.startTime - b.startTime);
          const selectedSlot = tomorrowFilteredSlots[0];
          const slotTime = new Date(selectedSlot.startTime * 1000);
          
          console.log(`Using tomorrow's preferred slot at ${slotTime.toLocaleTimeString()} (${slotTime.getHours()}:${slotTime.getMinutes()})`);
          return {
            startTime: selectedSlot.startTime,
            endTime: selectedSlot.endTime
          };
        }
      }
      
      // If no slots today at preferred time and no slots tomorrow at preferred time, fall back to any slot today
      if (allTodaySlots.length > 0) {
        console.log("No slots within preferred time range today or tomorrow, checking any available slot today");
        
        // If we have a time preference, try to find the slot closest to our preferred range
        if (timePreference && timePreference.startHour !== 0 && timePreference.endHour !== 24) {
          // Sort by closest to preferred time range
          allTodaySlots.sort((a, b) => {
            const aDate = new Date(a.startTime * 1000);
            const bDate = new Date(b.startTime * 1000);
            const aHour = aDate.getHours() + (aDate.getMinutes() / 60);
            const bHour = bDate.getHours() + (bDate.getMinutes() / 60);
            
            // Preferred midpoint
            const prefMidpoint = (timePreference.startHour + timePreference.endHour) / 2;
            
            // Return slot closest to preferred time midpoint
            return Math.abs(aHour - prefMidpoint) - Math.abs(bHour - prefMidpoint);
          });
          
          const selectedSlot = allTodaySlots[0];
          const slotTime = new Date(selectedSlot.startTime * 1000);
          
          console.log(`Using today's closest slot to preference at ${slotTime.toLocaleTimeString()} (${slotTime.getHours()}:${slotTime.getMinutes()})`);
          return {
            startTime: selectedSlot.startTime,
            endTime: selectedSlot.endTime
          };
        } else {
          // No preference - just use earliest slot today
          allTodaySlots.sort((a, b) => a.startTime - b.startTime);
          
          const selectedSlot = allTodaySlots[0];
          const slotTime = new Date(selectedSlot.startTime * 1000);
          
          console.log(`Using today's earliest slot at ${slotTime.toLocaleTimeString()} (${slotTime.getHours()}:${slotTime.getMinutes()})`);
          return {
            startTime: selectedSlot.startTime,
            endTime: selectedSlot.endTime
          };
        }
      }
      
      // If no slots today, use the first available slot from our filtered list for future dates
      console.log("No slots available today, checking future dates");
      
      // First try with preferred time
      if (filteredTimeSlots.length > 0) {
        // Use the first available slot
        filteredTimeSlots.sort((a, b) => a.startTime - b.startTime);
        const selectedSlot = filteredTimeSlots[0];
        const slotTime = new Date(selectedSlot.startTime * 1000);
        
        console.log(`Using future preferred slot at ${slotTime.toLocaleString()} (${slotTime.getHours()}:${slotTime.getMinutes()})`);
        return {
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime
        };
      }
      
      // If no slots match the preference, fall back to default time
      console.log("No available time slots found, using default time");
      return getDefaultTime();
    }
    
    console.log("No available time slots found, using default time");
    return getDefaultTime();
    
  } catch (error) {
    console.error("Error getting availability information:", error);
    return getDefaultTime();
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const { task, calendarId, email, timePreference, calendarsToConsider } = await request.json();
    
    // DEBUGGING - log all request data
    console.log("Calendar event creation request received:");
    console.log("- Task:", task);
    console.log("- Calendar ID:", calendarId);
    console.log("- Email received:", email);
    console.log("- Time preference:", timePreference);
    console.log("- Calendars to consider:", calendarsToConsider);
    console.log("- Task duration:", task.duration || 60, "minutes");
    
    // Type guard to ensure task has the right shape
    if (!task || typeof task !== 'object') {
      return NextResponse.json({ error: 'Invalid task format' }, { status: 400 });
    }
    
    if (!calendarId) {
      return NextResponse.json({ error: 'Calendar ID is required' }, { status: 400 });
    }
    
    // Get grant ID from cookies - AWAIT the cookies() call
    const cookieStore = await cookies();
    const grantId = cookieStore.get('nylasGrantId')?.value;
    console.log("Retrieved grant ID from cookies:", grantId);
    
    if (!grantId) {
      return NextResponse.json(
        { error: 'Nylas authentication required' },
        { status: 401 }
      );
    }
    
    // Get user email from various sources
    let userEmail = email;
    
    // Try cookie if no email was passed
    if (!userEmail) {
      // Try various cookie keys
      userEmail = cookieStore.get('userEmail')?.value
        || cookieStore.get('email')?.value
        || cookieStore.get('nylasUserEmail')?.value
        || '';
        
      console.log("Retrieved email from cookies:", userEmail);
    }
    
    // If still no email, try environment variable
    if (!userEmail) {
      userEmail = process.env.EMAIL || '';
      console.log("Using email from environment:", userEmail);
    }
    
    // Decode email if it's URL encoded
    let decodedEmail = userEmail;
    try {
      if (userEmail && userEmail.includes('%')) {
        decodedEmail = decodeURIComponent(userEmail);
        console.log(`Decoded email from "${userEmail}" to "${decodedEmail}"`);
      }
    } catch (e) {
      console.error("Error decoding email:", e);
    }
    
    // If we don't have an email, create a placeholder for non-availability checks
    if (!decodedEmail) {
      // This is just a placeholder when we don't have the actual email
      decodedEmail = 'user@example.com';
      console.log("Using placeholder email since no real email is available");
    }
    
    // Determine start and end times for the event
    let startTime: number;
    let endTime: number;
    
    // Get task duration (default to 60 minutes if not specified)
    const durationMinutes = task.duration && typeof task.duration === 'number' && task.duration > 0 
      ? task.duration 
      : 60;
    
    console.log(`Using task duration: ${durationMinutes} minutes`);
    
    // Check if the task has a deadline
    if (task.deadline) {
      try {
        // Try to parse deadline as a date string
        // When a date is specified without a time, JavaScript interprets it as midnight UTC
        // which can result in the previous day in local time zones like Eastern Time (UTC-4)
        const deadlineParts = task.deadline.split('-');
        
        // Log the original deadline and the parsed parts
        console.log(`Processing deadline: ${task.deadline}, parsed parts:`, deadlineParts);
        
        if (deadlineParts.length === 3) {
          // We have a YYYY-MM-DD format, create date explicitly for the local timezone
          // by using noon (12:00) of the specified day to avoid any timezone issues
          const year = parseInt(deadlineParts[0], 10);
          const month = parseInt(deadlineParts[1], 10) - 1; // Months are 0-indexed
          const day = parseInt(deadlineParts[2], 10);
          
          // Create a date at noon on the specified day to avoid timezone shifts
          const deadlineDate = new Date(year, month, day, 12, 0, 0);
          
          if (!isNaN(deadlineDate.getTime())) {
            console.log(`Interpreted deadline as: ${deadlineDate.toLocaleString()}`);
            
            // For deadline-based tasks, we want to schedule during preferred hours
            // rather than exactly at the deadline time
            if (timePreference && timePreference.startHour !== 0 && timePreference.endHour !== 24) {
              console.log(`Using time preference for deadline task: ${timePreference.label}`);
              
              // Create a date for the preferred start time on the deadline day
              const preferredStartDate = new Date(year, month, day, timePreference.startHour, 0, 0);
              
              // Only use the preferred time if it's in the future
              const nowTime = Date.now() / 1000;
              const preferredStartTime = Math.floor(preferredStartDate.getTime() / 1000);
              
              if (preferredStartTime > nowTime) {
                // We can use the preferred time on the deadline day
                startTime = preferredStartTime;
                endTime = startTime + (durationMinutes * 60);
                
                console.log(`Using preferred start time on deadline day: ${new Date(startTime * 1000).toLocaleString()}`);
              } else {
                // The preferred time has already passed, use findNextAvailableSlot
                console.log(`Preferred time on deadline day has passed, finding next available slot`);
                const timeSlot = await findNextAvailableSlot(
                  grantId, 
                  decodedEmail,
                  durationMinutes,
                  timePreference,
                  calendarsToConsider
                );
                startTime = timeSlot.startTime;
                endTime = timeSlot.endTime;
              }
            } else {
              // No time preference specified, use noon on the deadline day
              startTime = Math.floor(deadlineDate.getTime() / 1000);
              endTime = startTime + (durationMinutes * 60);
              
              console.log(`Using noon on deadline day: ${new Date(startTime * 1000).toLocaleString()}`);
            }
          } else {
            throw new Error(`Invalid date: ${task.deadline}`);
          }
        } else {
          // Not in YYYY-MM-DD format or contains time info, try standard parsing
          const deadlineDate = new Date(task.deadline);
          if (!isNaN(deadlineDate.getTime())) {
            console.log(`Using exact deadline time: ${deadlineDate.toLocaleString()}`);
            
            // Use the deadline as the end time
            endTime = Math.floor(deadlineDate.getTime() / 1000);
            // Set start time to before end time based on duration
            startTime = endTime - (durationMinutes * 60);
          } else {
            throw new Error(`Unable to parse deadline: ${task.deadline}`);
          }
        }
      } catch (error) {
        console.warn("Could not parse deadline date:", task.deadline, error);
        // Find a free slot
        const timeSlot = await findNextAvailableSlot(
          grantId, 
          decodedEmail,
          durationMinutes,
          timePreference,
          calendarsToConsider
        );
        startTime = timeSlot.startTime;
        endTime = timeSlot.endTime;
      }
    } else {
      // No deadline specified, find a free slot
      console.log(`No deadline specified, finding free slot for ${decodedEmail}`);
      const timeSlot = await findNextAvailableSlot(
        grantId, 
        decodedEmail,
        durationMinutes,
        timePreference,
        calendarsToConsider
      );
      startTime = timeSlot.startTime;
      endTime = timeSlot.endTime;
    }
    
    // Round startTime to the nearest 5-minute interval
    const roundedStartTime = Math.floor(startTime / 300) * 300; // 300 seconds = 5 minutes
    
    // Ensure the end time is also a multiple of 5 minutes
    const roundedEndTime = Math.floor(endTime / 300) * 300;
    
    console.log(`Using rounded start time: ${new Date(roundedStartTime * 1000).toISOString()} (${roundedStartTime})`);
    
    // Add a 1-minute buffer at the end time to prevent exact overlapping with another event
    const bufferedEndTime = roundedEndTime - 60; // Subtract 1 minute from the end time
    
    // Prepare event details
    const eventTitle = `Task: ${task.description.length > 60 ? task.description.substring(0, 57) + '...' : task.description}`;
    const eventDescription = `${task.description}\n\nPriority: ${task.priority}\nType: ${task.task_type}`;
    
    // Create the event in Nylas
    const event = await nylas.events.create({
      identifier: grantId,
      requestBody: {
        title: eventTitle,
        description: eventDescription,
        when: {
          startTime: roundedStartTime,
          endTime: roundedStartTime + (durationMinutes * 60), // Calculate end time correctly based on duration
        },
        busy: true,
      },
      queryParams: {
        calendarId: calendarId,
      },
    });
    
    // Format the response
    const formattedStartTime = new Date(roundedStartTime * 1000).toLocaleString();
    const formattedEndTime = new Date(bufferedEndTime * 1000).toLocaleString();
    
    // Store task in Qdrant
    try {
      // Generate a unique ID for the task
      const taskId = uuidv4();
      
      // Ensure collection exists
      await ensureCollection();
      
      // Prepare task payload
      const taskPayload = {
        ...task,
        calendarId,
        timePreference,
        calendarsToConsider,
        eventId: event.data?.id || 'unknown',
        eventTitle,
        startTime: roundedStartTime,
        endTime: roundedStartTime + (durationMinutes * 60),
        formattedStartTime,
        formattedEndTime,
        userEmail: decodedEmail,
        createdAt: new Date().toISOString(),
      };
      
      // Upsert task to Qdrant
      const qdrantResult = await upsertTask(taskId, task.description, taskPayload);
      
      if (!qdrantResult.success) {
        console.error("Failed to store task in Qdrant:", qdrantResult.error);
      } else {
        console.log("Successfully stored task in Qdrant with ID:", taskId);
      }
    } catch (qdrantError) {
      console.error("Error storing task in Qdrant:", qdrantError);
      // Don't fail the whole request if Qdrant storage fails
    }
    
    return NextResponse.json({
      success: true,
      message: `Calendar event created for task: ${task.description}`,
      event: {
        ...event,
        formattedStartTime,
        formattedEndTime
      }
    });
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error creating calendar event:", error);
    return NextResponse.json({ error: `Failed to create calendar event: ${errorMessage}` }, { status: 500 });
  }
}
