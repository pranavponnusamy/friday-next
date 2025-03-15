'use client';

import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import TimePreferenceSelector, { TimePreference, TIME_PREFERENCES } from './TimePreferenceSelector';

interface Task {
  description: string;
  deadline: string | null;
  task_type: 'meeting_scheduling' | 'reminder' | 'to_do_item';
  priority: number;
  context: string;
  duration?: number; // Add optional duration
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
  const [calendarsToConsider, setCalendarsToConsider] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [timePreference, setTimePreference] = useState<TimePreference>(TIME_PREFERENCES[0]); // Default to "Any time"
  const [showCalendarSelection, setShowCalendarSelection] = useState(false);
  const [taskDuration, setTaskDuration] = useState<number>(task.duration || 60); // Default 60 minutes if not specified
  const [taskId] = useState<string>(uuidv4()); // Generate a unique ID for the task

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
            // By default, consider all calendars for conflict checking
            setCalendarsToConsider(data.calendars.map((cal: Calendar) => cal.id));
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

      // Create a copy of the task with the duration added
      const taskWithDuration = {
        ...task,
        duration: taskDuration
      };
      
      const response = await fetch('/api/nylas/create-calendar-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task: taskWithDuration,
          calendarId: selectedCalendarId,
          timePreference: timePreference, // Pass the selected time preference
          calendarsToConsider: calendarsToConsider // Pass selected calendars for conflict checking
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create calendar event');
      }
      
      // Successfully created the event
      const responseData = await response.json(); // Consume the response body
      
      // Store task in Qdrant
      try {
        const qdrantResponse = await fetch('/api/qdrant/upsert-task', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            taskId,
            taskText: task.description,
            taskPayload: {
              ...taskWithDuration,
              calendarId: selectedCalendarId,
              timePreference: timePreference,
              eventId: responseData.event?.id || null,
              createdAt: new Date().toISOString(),
            }
          }),
        });
        
        if (!qdrantResponse.ok) {
          console.error('Failed to store task in Qdrant, but calendar event was created');
          // Don't throw error here to avoid interrupting the success flow
        }
      } catch (qdrantError) {
        console.error('Error storing task in Qdrant:', qdrantError);
        // Don't throw error here to avoid interrupting the success flow
      }
      
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

  const toggleCalendarConsideration = (calendarId: string) => {
    setCalendarsToConsider(prev => {
      if (prev.includes(calendarId)) {
        return prev.filter(id => id !== calendarId);
      } else {
        return [...prev, calendarId];
      }
    });
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
              Select Calendar to Add Event To
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
          
          <div className="mb-4">
            <label htmlFor="duration-select" className="block text-sm font-medium text-gray-700 mb-1">
              Task Duration (minutes)
            </label>
            <select
              id="duration-select"
              className="block w-full p-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-800
                focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all 
                hover:border-blue-400 cursor-pointer appearance-none
                bg-no-repeat bg-[right_0.5rem_center] bg-[length:1.5em_1.5em]
                bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236b7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.293%207.293a1%201%200%20011.414%200L10%2010.586l3.293-3.293a1%201%200%20111.414%201.414l-4%204a1%201%200%2001-1.414%200l-4-4a1%201%200%20010-1.414z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')]"
              value={taskDuration}
              onChange={(e) => setTaskDuration(Number(e.target.value))}
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
            </select>
          </div>
          
          <div className="mb-4">
            <TimePreferenceSelector
              selectedPreference={timePreference}
              onChange={setTimePreference}
            />
          </div>
          
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setShowCalendarSelection(!showCalendarSelection)}
              className="flex items-center text-sm text-blue-600 hover:text-blue-800 focus:outline-none"
            >
              <span className="mr-1">{showCalendarSelection ? '▼' : '►'}</span>
              Advanced: Select calendars to check for conflicts
            </button>
            
            {showCalendarSelection && (
              <div className="mt-2 ml-5 border-l-2 border-gray-200 pl-3">
                <p className="text-xs text-gray-600 mb-2">
                  Only selected calendars will be checked for conflicts when scheduling your task
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  <div className="flex items-center mb-1">
                    <input
                      id="select-all-calendars"
                      type="checkbox"
                      className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      checked={calendarsToConsider.length === calendars.length}
                      onChange={() => {
                        if (calendarsToConsider.length === calendars.length) {
                          setCalendarsToConsider([]);
                        } else {
                          setCalendarsToConsider(calendars.map(cal => cal.id));
                        }
                      }}
                    />
                    <label htmlFor="select-all-calendars" className="ml-2 text-sm font-medium text-gray-700">
                      Select All Calendars
                    </label>
                  </div>
                  
                  {calendars.map((calendar) => (
                    <div key={calendar.id} className="flex items-center">
                      <input
                        id={`calendar-check-${calendar.id}`}
                        type="checkbox"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={calendarsToConsider.includes(calendar.id)}
                        onChange={() => toggleCalendarConsideration(calendar.id)}
                      />
                      <label htmlFor={`calendar-check-${calendar.id}`} className="ml-2 text-sm text-gray-700">
                        {calendar.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <button
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            onClick={handleAddToCalendar}
            disabled={loading || !selectedCalendarId || calendarsToConsider.length === 0}
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
