'use client';

import { useState, useEffect } from 'react';

interface Task {
  description: string;
  deadline: string | null;
  task_type: 'meeting_scheduling' | 'reminder' | 'to_do_item';
  priority: number;
  context: string;
}

interface Calendar {
  id: string;
  name: string;
  description: string;
  read_only: boolean;
  location: string;
  timezone: string;
}

interface CalendarTaskManagerProps {
  tasks: Task[];
  onError?: (message: string) => void;
}

export default function CalendarTaskManager({ tasks, onError }: CalendarTaskManagerProps) {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('');
  const [loadingCalendars, setLoadingCalendars] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch available calendars when the component mounts
  useEffect(() => {
    const fetchCalendars = async () => {
      try {
        setLoadingCalendars(true);
        setError(null);
        
        const response = await fetch('/api/nylas/list-calendars');
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch calendars');
        }
        
        const data = await response.json();
        
        if (data.calendars && Array.isArray(data.calendars)) {
          setCalendars(data.calendars);
          // Auto-select the first calendar if available
          if (data.calendars.length > 0 && data.calendars.some((cal: Calendar) => !cal.read_only)) {
            // Find first non-read-only calendar
            const firstWritableCalendar = data.calendars.find((cal: Calendar) => !cal.read_only);
            if (firstWritableCalendar) {
              setSelectedCalendarId(firstWritableCalendar.id);
            } else {
              setSelectedCalendarId(data.calendars[0].id);
            }
          }
        } else {
          setCalendars([]);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch calendars';
        setError(errorMessage);
        if (onError) onError(errorMessage);
      } finally {
        setLoadingCalendars(false);
      }
    };
    
    fetchCalendars();
  }, [onError]);

  // If there are no tasks, don't render anything
  if (!tasks || tasks.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 p-4 bg-white border border-gray-200 rounded-md shadow-sm">
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-md p-4 border border-indigo-200">
        <h3 className="text-lg font-semibold mb-3 text-indigo-800">Task Calendar</h3>
        
        {error && (
          <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}
        
        {loadingCalendars ? (
          <div className="text-indigo-600">Loading calendars...</div>
        ) : calendars.length === 0 ? (
          <div className="text-red-600">
            No calendars available. Make sure your Nylas account is connected.
          </div>
        ) : (
          <div>
            <div className="mb-4">
              <label htmlFor="calendar-select" className="block text-sm font-medium text-indigo-700 mb-1">
                Select Calendar
              </label>
              <select
                id="calendar-select"
                className="block w-full p-2 border border-indigo-300 rounded-md shadow-sm 
                         focus:ring-indigo-500 focus:border-indigo-500 bg-white
                         text-indigo-800"
                value={selectedCalendarId}
                onChange={(e) => setSelectedCalendarId(e.target.value)}
              >
                <option value="">Select a calendar...</option>
                {calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id} disabled={calendar.read_only} 
                         className={calendar.read_only ? "text-gray-400" : "text-indigo-800"}>
                    {calendar.name} {calendar.read_only ? '(Read Only)' : ''}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="space-y-3">
              {tasks.map((task, index) => (
                <div key={index} className="bg-white p-3 border border-indigo-200 rounded-md shadow-sm hover:shadow transition-shadow">
                  <p className="text-indigo-800 font-medium mb-2">{task.description}</p>
                  {task.deadline && (
                    <p className="text-sm text-gray-800 mb-2">
                      <strong>Due:</strong> {task.deadline}
                    </p>
                  )}
                  <button
                    className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md shadow-sm"
                    onClick={() => handleAddTaskToCalendar(task, selectedCalendarId, setError, () => {}, onError)}
                  >
                    Add to Calendar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const handleAddTaskToCalendar = async (
  task: Task, 
  calendarId: string, 
  setError: (error: string | null) => void,
  onSuccess?: (message: string, task?: Task) => void,
  onError?: (message: string) => void
) => {
  if (!calendarId) {
    const errorMsg = 'Please select a calendar first';
    setError(errorMsg);
    if (onError) onError(errorMsg);
    return;
  }

  setError(null);
  
  try {
    // DEBUGGING - log all cookie values
    console.log("All cookies:", document.cookie);
    
    // Get user email from various possible sources
    let userEmail = '';
    
    // Try to get from localStorage first
    userEmail = localStorage.getItem('userEmail') || '';
    console.log("Email from localStorage:", userEmail);
    
    // If not in localStorage, try to get from cookies
    if (!userEmail) {
      const cookies = document.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);
      
      userEmail = cookies.email || cookies.userEmail || cookies.nylasUserEmail || '';
      console.log("Email from cookies:", userEmail, "Available cookie keys:", Object.keys(cookies));
    }
    
    // If still no email, try to get from Nylas grant ID cookie which might contain the email
    if (!userEmail) {
      try {
        const nylasGrantCookie = document.cookie
          .split(';')
          .find(cookie => cookie.trim().startsWith('nylasGrantId='));
          
        if (nylasGrantCookie) {
          // Some implementations store email in the grant ID format
          const grantValue = nylasGrantCookie.split('=')[1];
          console.log("Grant value from cookie:", grantValue);
          if (grantValue && grantValue.includes('@')) {
            userEmail = grantValue;
            console.log("Using email from grant ID:", userEmail);
          }
        } else {
          console.log("No nylasGrantId cookie found");
        }
      } catch (e) {
        console.error('Error parsing Nylas grant cookie:', e);
      }
    }
    
    // DEBUGGING - Hard-code a test email if nothing else works
    if (!userEmail) {
      // For development/testing - use a real email pattern
      userEmail = 'test@example.com';
      console.warn('⚠️ FALLBACK: Using hard-coded test email as no user email was found');
    }
    
    console.log(`Final email being used for scheduling: "${userEmail}"`);
    
    // DEBUGGING - Check for nylasGrantId in localStorage as well
    const storedGrantId = localStorage.getItem('nylasGrantId');
    console.log("Grant ID from localStorage:", storedGrantId);
    
    // Create calendar event
    const response = await fetch('/api/nylas/create-calendar-event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task,
        calendarId,
        email: userEmail
      }),
    });

    const responseData = await response.json();
    
    if (!response.ok) {
      throw new Error(responseData.error || 'Failed to add task to calendar');
    }

    console.log('Task added to calendar:', responseData);
    
    if (onSuccess) {
      onSuccess(responseData.message || 'Task added to calendar successfully', task);
    }
  } catch (error) {
    console.error('Error adding task to calendar:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
    setError(errorMsg);
    if (onError) onError(errorMsg);
  }
};
