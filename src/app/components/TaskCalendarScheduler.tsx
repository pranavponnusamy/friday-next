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

interface TaskCalendarSchedulerProps {
  task: Task;
  onSuccess?: (message: string) => void;
  onError?: (error: string) => void;
}

export default function TaskCalendarScheduler({ task, onSuccess, onError }: TaskCalendarSchedulerProps) {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch available calendars when the component mounts
  useEffect(() => {
    const fetchCalendars = async () => {
      try {
        setCalendarLoading(true);
        const response = await fetch('/api/nylas/list-calendars');
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch calendars');
        }
        
        const data = await response.json();
        
        if (data.calendars && Array.isArray(data.calendars)) {
          setCalendars(data.calendars);
          // Auto-select the first calendar if available
          if (data.calendars.length > 0) {
            setSelectedCalendarId(data.calendars[0].id);
          }
        } else {
          setCalendars([]);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch calendars';
        setError(errorMessage);
        if (onError) onError(errorMessage);
      } finally {
        setCalendarLoading(false);
      }
    };
    
    fetchCalendars();
  }, [onError]);

  const handleAddToCalendar = async () => {
    if (!selectedCalendarId) {
      const errorMsg = 'Please select a calendar first';
      setError(errorMsg);
      if (onError) onError(errorMsg);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      
      const response = await fetch('/api/nylas/create-calendar-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task,
          calendarId: selectedCalendarId,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create calendar event');
      }
      
      const data = await response.json();
      const successMsg = 'Task added to calendar successfully!';
      setSuccess(successMsg);
      if (onSuccess) onSuccess(successMsg);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add task to calendar';
      setError(errorMessage);
      if (onError) onError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 p-4 bg-white border border-gray-200 rounded-md">
      <h4 className="text-lg font-medium mb-3">Add to Calendar</h4>
      
      {calendarLoading ? (
        <div className="text-sm text-gray-600">Loading calendars...</div>
      ) : calendars.length === 0 ? (
        <div className="text-sm text-red-600">No calendars available. Make sure your Nylas account is connected.</div>
      ) : (
        <>
          <div className="mb-4">
            <label htmlFor="calendar-select" className="block text-sm font-medium text-gray-700 mb-1">
              Select Calendar
            </label>
            <select
              id="calendar-select"
              className="block w-full p-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-800
                focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all 
                hover:border-blue-400 cursor-pointer appearance-none
                bg-no-repeat bg-[right_0.5rem_center] bg-[length:1.5em_1.5em]
                bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236b7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.293%207.293a1%201%200%20011.414%200L10%2010.586l3.293-3.293a1%201%200%20111.414%201.414l-4%204a1%201%200%2001-1.414%200l-4-4a1%201%200%20010-1.414z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')]"
              value={selectedCalendarId}
              onChange={(e) => setSelectedCalendarId(e.target.value)}
            >
              <option value="" disabled>-- Select a calendar --</option>
              {calendars.map((calendar) => (
                <option 
                  key={calendar.id} 
                  value={calendar.id} 
                  disabled={calendar.read_only}
                  className={calendar.read_only ? "text-gray-400 italic" : ""}
                >
                  {calendar.name} {calendar.read_only ? '(Read Only)' : ''}
                </option>
              ))}
            </select>
          </div>
          
          <button
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            onClick={handleAddToCalendar}
            disabled={loading || !selectedCalendarId}
          >
            {loading ? 'Adding to Calendar...' : 'Add to Calendar'}
          </button>
          
          {error && (
            <div className="mt-2 text-sm text-red-600">
              {error}
            </div>
          )}
          
          {success && (
            <div className="mt-2 text-sm text-green-600">
              {success}
            </div>
          )}
        </>
      )}
    </div>
  );
}
