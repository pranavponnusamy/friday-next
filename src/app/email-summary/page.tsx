'use client';

import { useState, useEffect, useCallback } from 'react';
import TimePreferenceSelector, { TimePreference, TIME_PREFERENCES } from '../components/TimePreferenceSelector';

interface EmailData {
  id: string;
  subject: string;
  from: { email: string; name: string }[];
  date: number;
  body: string;
  starred?: boolean;
  unread?: boolean;
  folders?: string[];
  threadId?: string;
}

interface Task {
  description: string;
  deadline: string | null;
  task_type: 'meeting_scheduling' | 'reminder' | 'to_do_item';
  priority: number;
  context: string;
  duration?: number; // Add duration property to Task interface
}

interface ProcessedEmailResponse {
  email: EmailData;
  summary: string;
  tasks: Task[];
  currentIndex: number;
  totalEmails: number;
  isMock?: boolean;
  error?: string;
  hasTaskErrors?: boolean;
  taskErrors?: string[];
}

interface Calendar {
  id: string;
  name: string;
  description?: string;
  read_only?: boolean;
  location?: string;
  timezone?: string;
}

export default function EmailSummary() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailData, setEmailData] = useState<ProcessedEmailResponse | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cachedEmails, setCachedEmails] = useState<Record<number, ProcessedEmailResponse>>({});
  const [prefetchingNext, setPrefetchingNext] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false); // New state for transitions

  // State for managing calendar functionality
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('');
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [addingTaskIds, setAddingTaskIds] = useState<Set<number>>(new Set());
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarSuccess, setCalendarSuccess] = useState<string | null>(null);
  const [timePreference, setTimePreference] = useState<TimePreference>(TIME_PREFERENCES[0]); // Default to "Any time"
  const [calendarsToConsider, setCalendarsToConsider] = useState<string[]>([]);
  const [expandedView, setExpandedView] = useState(false);
  const [calendarSectionExpanded, setCalendarSectionExpanded] = useState(false);

  // For optimizing navigation, preload both directions
  const prefetchRange = 10; // Increased prefetch range for better responsiveness
  const prefetchThreshold = 8; // Start prefetching next batch when we reach this index

  // Function to prefetch next batch of emails when approaching threshold
  const prefetchNextBatch = useCallback(async (currentIdx: number, totalEmails: number) => {
    setPrefetchingNext(true);
    
    // Prefetch the next 10 emails beyond current position
    const batchSize = 10;
    const startIdx = currentIdx + 1;
    const endIdx = Math.min(startIdx + batchSize, totalEmails);
    
    console.log(`Prefetching next batch of emails from ${startIdx} to ${endIdx-1}`);
    
    // Create array of indices to prefetch
    const indicesToPrefetch = [];
    for (let i = startIdx; i < endIdx; i++) {
      if (!cachedEmails[i]) {
        indicesToPrefetch.push(i);
      }
    }
    
    if (indicesToPrefetch.length === 0) {
      setPrefetchingNext(false);
      return; // Nothing to prefetch
    }
    
    // Prefetch all emails in parallel
    const prefetchPromises = indicesToPrefetch.map(async (idx) => {
      try {
        const prefetchResponse = await fetch(`/api/nylas/process-email?index=${idx}`);
        
        if (prefetchResponse.ok) {
          const prefetchData = await prefetchResponse.json();
          
          // Add to cache
          setCachedEmails(prev => ({ ...prev, [idx]: prefetchData }));
        }
      } catch (err) {
        console.error(`Error prefetching email at index ${idx}:`, err);
      }
    });
    
    try {
      await Promise.all(prefetchPromises);
      console.log(`Prefetched ${indicesToPrefetch.length} emails successfully`);
    } catch (err) {
      console.error('Error during batch prefetching:', err);
    } finally {
      setPrefetchingNext(false);
    }
  }, [cachedEmails, setCachedEmails]);

  // Function to prefetch adjacent emails
  const prefetchAdjacentEmails = useCallback(async (index: number, totalEmails: number) => {
    // Prefetch the next and previous emails if they're not already cached
    const adjacentIndices = [];
    
    // Check next index
    if (index + 1 < totalEmails && !cachedEmails[index + 1]) {
      adjacentIndices.push(index + 1);
    }
    
    // Check previous index
    if (index - 1 >= 0 && !cachedEmails[index - 1]) {
      adjacentIndices.push(index - 1);
    }
    
    if (adjacentIndices.length === 0) return; // Nothing to prefetch
    
    console.log(`Prefetching adjacent emails: ${adjacentIndices.join(', ')}`);
    
    // Prefetch adjacent emails in parallel
    const prefetchPromises = adjacentIndices.map(async (idx) => {
      try {
        const prefetchResponse = await fetch(`/api/nylas/process-email?index=${idx}`);
        
        if (prefetchResponse.ok) {
          const prefetchData = await prefetchResponse.json();
          
          // Add to cache
          setCachedEmails(prev => ({ ...prev, [idx]: prefetchData }));
        }
      } catch (err) {
        console.error(`Error prefetching email at index ${idx}:`, err);
      }
    });
    
    try {
      await Promise.all(prefetchPromises);
    } catch (err) {
      console.error('Error during adjacent email prefetching:', err);
    }
  }, [cachedEmails, setCachedEmails]);

  // Optimized navigation function
  const navigateToEmail = useCallback(async (index: number) => {
    // Exit early if we're already at this index
    if (index === currentIndex) return;
    
    // Start transition effect
    setIsTransitioning(true);
    setLoading(true); // Show loading state during navigation
    
    // Use cached email if available
    if (cachedEmails[index]) {
      // Short timeout to allow transition effect
      setTimeout(() => {
        setEmailData(cachedEmails[index]);
        setCurrentIndex(index);
        setIsTransitioning(false);
        setLoading(false); // Hide loading state
        
        // Check if we're approaching the threshold to prefetch more emails
        if (index >= prefetchThreshold && emailData?.totalEmails && index < emailData.totalEmails - 2) {
          // Trigger prefetching of next batch
          prefetchNextBatch(index, emailData.totalEmails);
        } else {
          // Otherwise, just prefetch adjacent emails
          prefetchAdjacentEmails(index, emailData?.totalEmails || 0);
        }
      }, 10);
    } else {
      try {
        // If not cached, fetch it
        const response = await fetch(`/api/nylas/process-email?index=${index}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch email data');
        }
        
        const data = await response.json();
        
        // Add to cache
        setCachedEmails(prev => ({ ...prev, [index]: data }));
        
        // Update state
        setEmailData(data);
        setCurrentIndex(index);
        
        // Check if we're approaching the threshold to prefetch more emails
        if (index >= prefetchThreshold && data.totalEmails && index < data.totalEmails - 2) {
          // Trigger prefetching of next batch
          prefetchNextBatch(index, data.totalEmails);
        } else {
          // Otherwise, just prefetch adjacent emails
          prefetchAdjacentEmails(index, data.totalEmails);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred while fetching email data');
        console.error(`Error navigating to email:`, err);
      } finally {
        setIsTransitioning(false);
        setLoading(false); // Hide loading state
      }
    }
  }, [cachedEmails, currentIndex, emailData?.totalEmails, prefetchAdjacentEmails, prefetchNextBatch]);

  // Initial load with aggressive prefetching
  useEffect(() => {
    const loadInitialEmails = async () => {
      try {
        // Load current email
        const response = await fetch(`/api/nylas/process-email?index=${currentIndex}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch email data');
        }
        
        const data = await response.json();
        
        // Add to cache and update state
        setCachedEmails(prev => ({ ...prev, [currentIndex]: data }));
        setEmailData(data);
        
        // After the current email loads, prefetch emails in both directions
        const totalEmails = data.totalEmails;
        setPrefetchingNext(true);
        
        // Create an array of indices to prefetch, prioritizing next emails over previous ones
        const indicesToPrefetch = [];
        
        // First add next emails
        for (let i = 1; i <= prefetchRange; i++) {
          const nextIndex = currentIndex + i;
          if (nextIndex < totalEmails) {
            indicesToPrefetch.push(nextIndex);
          }
        }
        
        // Then add previous emails
        for (let i = 1; i <= prefetchRange/2; i++) {
          const prevIndex = currentIndex - i;
          if (prevIndex >= 0) {
            indicesToPrefetch.push(prevIndex);
          }
        }
        
        // Prefetch all emails in parallel - no sequential waiting
        const prefetchPromises = indicesToPrefetch.map(async (idx) => {
          // Skip if already cached
          if (cachedEmails[idx]) return;
          
          try {
            const prefetchResponse = await fetch(`/api/nylas/process-email?index=${idx}`);
            
            if (prefetchResponse.ok) {
              const prefetchData = await prefetchResponse.json();
              
              // Add to cache
              setCachedEmails(prev => ({ ...prev, [idx]: prefetchData }));
            }
          } catch (err) {
            console.error(`Error prefetching email at index ${idx}:`, err);
          }
        });
        
        // Run all prefetch operations in parallel
        await Promise.all(prefetchPromises);
        
        setPrefetchingNext(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred while fetching email data');
        console.error(`Error loading initial emails:`, err);
      } finally {
        setLoading(false);
      }
    };
    
    setLoading(true);
    loadInitialEmails();
  }, [cachedEmails, currentIndex]); // Add missing dependencies

  // Prefetch the next email when the current one loads
  useEffect(() => {
    if (emailData && currentIndex < emailData.totalEmails - 1) {
      const nextIndex = currentIndex + 1;
      if (!cachedEmails[nextIndex]) {
        setPrefetchingNext(true);
        prefetchAdjacentEmails(nextIndex, emailData.totalEmails);
      }
    }
    
    // If we're not at the beginning, also prefetch the previous email
    if (emailData && currentIndex > 0 && !cachedEmails[currentIndex - 1]) {
      setPrefetchingNext(true);
      prefetchAdjacentEmails(currentIndex - 1, emailData.totalEmails);
    }
  }, [emailData, currentIndex, prefetchAdjacentEmails, cachedEmails]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  // Get the priority color for tasks
  const getPriorityColor = (priority: number) => {
    switch(priority) {
      case 5: return 'bg-red-100 text-red-800 border-red-300';
      case 4: return 'bg-orange-100 text-orange-800 border-orange-300';
      case 3: return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 2: return 'bg-indigo-100 text-indigo-800 border-indigo-300';
      case 1: 
      default: return 'bg-green-100 text-green-800 border-green-300';
    }
  };

  // Get task type icon
  const getTaskTypeIcon = (type: string) => {
    switch(type) {
      case 'meeting_scheduling': return '📅';
      case 'reminder': return '⏰';
      case 'to_do_item': 
      default: return '✓';
    }
  };

  // Format the email body for display
  const formatEmailBody = (body: string): { __html: string } => {
    if (!body) return { __html: '' };
    
    // Check if it's already HTML (contains HTML tags)
    const hasHtmlTags = /<[a-z][\s\S]*>/i.test(body);
    
    if (hasHtmlTags) {
      return { __html: body };
    } else {
      // Convert plain text to HTML with line breaks
      const textWithBreaks = body.replace(/\n/g, '<br />');
      return { __html: textWithBreaks };
    }
  };

  // Utility function to format duration in a human-readable way
  const formatDuration = (minutes: number): string => {
    if (!minutes || minutes <= 0) return 'Unknown';
    
    if (minutes < 60) {
      return `${minutes} min`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      
      if (remainingMinutes === 0) {
        return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
      } else {
        return `${hours}h ${remainingMinutes}m`;
      }
    }
  };

  // Function to add a task to calendar
  const handleAddTaskToCalendar = async (task: Task, taskIndex: number) => {
    if (!selectedCalendarId) {
      setCalendarError('Please select a calendar first');
      return;
    }
    
    try {
      // Mark this task as being added
      setAddingTaskIds(prev => new Set([...prev, taskIndex]));
      setCalendarError(null);
      setCalendarSuccess(null);
      
      const response = await fetch('/api/nylas/create-calendar-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task,
          calendarId: selectedCalendarId,
          timePreference: timePreference, // Include the time preference
          calendarsToConsider: calendarsToConsider.length > 0 ? calendarsToConsider : undefined
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create calendar event');
      }
      
      // Successfully created the event
      await response.json(); // Consume the response body
      setCalendarSuccess(`Task "${task.description}" added to calendar successfully!`);
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setCalendarSuccess(null);
      }, 3000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add task to calendar';
      setCalendarError(errorMessage);
    } finally {
      // Remove this task from the loading state
      setAddingTaskIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(taskIndex);
        return newSet;
      });
    }
  };

  // Fetch available calendars
  useEffect(() => {
    const fetchCalendars = async () => {
      try {
        setCalendarLoading(true);
        setCalendarError(null);
        
        const response = await fetch('/api/nylas/list-calendars');
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch calendars');
        }
        
        const data = await response.json();
        
        if (data.calendars && Array.isArray(data.calendars)) {
          setCalendars(data.calendars);
          
          // Auto-select the first calendar if available
          if (data.calendars.length > 0 && data.calendars.some((cal: { read_only?: boolean }) => !cal.read_only)) {
            // Find first non-read-only calendar
            const firstWritableCalendar = data.calendars.find((cal: { read_only?: boolean; id: string }) => !cal.read_only);
            if (firstWritableCalendar) {
              setSelectedCalendarId(firstWritableCalendar.id);
            } else {
              setSelectedCalendarId(data.calendars[0].id);
            }
          }
          
          // Pre-select all calendars for availability checking
          const allCalendarIds = data.calendars.map((cal: Calendar) => cal.id);
          setCalendarsToConsider(allCalendarIds);
        } else {
          setCalendars([]);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch calendars';
        setCalendarError(errorMessage);
      } finally {
        setCalendarLoading(false);
      }
    };
    
    // Load calendars immediately when component mounts, regardless of tasks
    fetchCalendars();
  }, []); // Empty dependency array to only run once on mount

  // Display task section
  const renderTasks = () => {
    if (!emailData?.tasks || emailData.tasks.length === 0) {
      return (
        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-md">
          <p className="text-indigo-800 mb-4">No tasks were extracted from this email.</p>
        </div>
      );
    }
    
    return (
      <div className="space-y-4">
        {emailData.tasks.map((task, idx) => (
          <div key={idx} className="bg-white p-4 border border-indigo-200 rounded-md shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div className="flex-grow">
                <div className="flex justify-between">
                  <h3 className="text-lg font-semibold text-indigo-800 mb-1">{task.description}</h3>
                  <span className={`${getPriorityColor(task.priority)} px-2 py-1 text-xs rounded-md font-medium`}>
                    Priority: {task.priority}
                  </span>
                </div>
                
                <div className="flex flex-wrap gap-2 mb-2">
                  <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-indigo-100 text-indigo-800">
                    {getTaskTypeIcon(task.task_type)} {task.task_type.replace(/_/g, ' ')}
                  </span>
                  {task.deadline && (
                    <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
                      Due: {task.deadline}
                    </span>
                  )}
                  {task.duration && (
                    <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">
                      Duration: {formatDuration(task.duration)}
                    </span>
                  )}
                </div>
                
                {task.context && (
                  <p className="text-sm text-gray-800 mt-1 mb-3">{task.context}</p>
                )}
                
                <button
                  className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                    addingTaskIds.has(idx) 
                      ? 'bg-gray-300 text-gray-700 cursor-not-allowed' 
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                  onClick={() => handleAddTaskToCalendar(task, idx)}
                  disabled={addingTaskIds.has(idx) || calendarLoading || calendars.length === 0}
                >
                  {addingTaskIds.has(idx) ? 'Adding...' : 'Add to Calendar'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const handleNext = useCallback(() => {
    if (emailData && currentIndex < emailData.totalEmails - 1) {
      navigateToEmail(currentIndex + 1);
    }
  }, [currentIndex, emailData, navigateToEmail]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      navigateToEmail(currentIndex - 1);
    }
  }, [currentIndex, navigateToEmail]);

  // fetchProcessedEmail has been removed as it's no longer used - prefetchAdjacentEmails is used instead

  if (loading && !emailData) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="text-lg text-blue-700">Loading email insights...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 p-8">
        <div className="container mx-auto max-w-4xl">
          <div className="bg-red-50 p-6 rounded-md border border-red-200 mb-6">
            <p className="text-red-800 mb-4">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="w-full px-4 py-8">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Email Summary</h1>
          
          {/* Moved Calendar Selection to top level */}
          {emailData && emailData.tasks && emailData.tasks.length > 0 && (
            <button
              onClick={() => setCalendarSectionExpanded(!calendarSectionExpanded)}
              className="px-4 py-2 text-sm bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center"
            >
              {calendarSectionExpanded ? 'Hide Calendar Options' : 'Show Calendar Options'}
              <svg 
                className={`ml-1 h-4 w-4 transform transition-transform duration-200 ${calendarSectionExpanded ? 'rotate-180' : ''}`}
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
        
        {/* Minimized Calendar Selection */}
        {emailData && emailData.tasks && emailData.tasks.length > 0 && calendarSectionExpanded && (
          <div className="bg-white p-4 mb-4 rounded-lg shadow-sm">
            <div className="p-4 border border-indigo-200 rounded-md bg-gradient-to-r from-indigo-50 to-purple-50">
              <h3 className="text-lg font-semibold mb-3 text-indigo-800">Calendar Selection</h3>
              
              {calendarLoading ? (
                <div className="text-indigo-600">Loading calendars...</div>
              ) : calendars.length === 0 ? (
                <div className="text-red-600">
                  No calendars available. Make sure your Nylas account is connected.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="calendar-select" className="block text-sm font-medium text-indigo-700 mb-1">
                      Task Calendar
                    </label>
                    <select
                      id="calendar-select"
                      className="block w-full p-2 border border-indigo-300 rounded-md shadow-sm 
                               focus:ring-indigo-500 focus:border-indigo-500 bg-white
                               text-indigo-800"
                      value={selectedCalendarId}
                      onChange={(e) => setSelectedCalendarId(e.target.value)}
                    >
                      {calendars.map((calendar) => (
                        <option key={calendar.id} value={calendar.id} disabled={calendar.read_only} 
                               className={calendar.read_only ? "text-gray-400" : "text-indigo-800"}>
                          {calendar.name} {calendar.read_only ? '(Read Only)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <TimePreferenceSelector
                      selectedPreference={timePreference}
                      onChange={setTimePreference}
                    />
                    <p className="text-xs text-indigo-600 mt-1">
                      Scheduling preference for tasks
                    </p>
                  </div>
                  
                  <div className="md:col-span-2">
                    <label htmlFor="calendars-to-consider" className="block text-sm font-medium text-indigo-700 mb-1">
                      Calendars to Check for Availability
                    </label>
                    <div className="flex flex-wrap gap-2 p-2 border border-indigo-300 rounded-md bg-white">
                      {calendars.map((calendar) => (
                        <div key={`consider-${calendar.id}`} className="flex items-center">
                          <input
                            type="checkbox"
                            id={`consider-${calendar.id}`}
                            checked={calendarsToConsider.includes(calendar.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setCalendarsToConsider(prev => [...prev, calendar.id]);
                              } else {
                                setCalendarsToConsider(prev => prev.filter(id => id !== calendar.id));
                              }
                            }}
                            className="h-4 w-4 text-indigo-600 border-indigo-300 rounded"
                          />
                          <label htmlFor={`consider-${calendar.id}`} className="ml-2 text-sm text-indigo-800">
                            {calendar.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {(calendarError || calendarSuccess) && (
                    <div className="md:col-span-2">
                      {calendarError && (
                        <div className="p-2 bg-red-50 text-red-700 rounded-md border border-red-200">
                          {calendarError}
                        </div>
                      )}
                      
                      {calendarSuccess && (
                        <div className="p-2 bg-green-50 text-green-700 rounded-md border border-green-200">
                          {calendarSuccess}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Navigation Controls */}
        <div className="bg-white p-4 mb-4 rounded-lg shadow-sm flex justify-between items-center">
          <button
            onClick={handlePrevious}
            disabled={loading || currentIndex === 0 || isTransitioning}
            className={`px-4 py-2 rounded-md ${
              currentIndex === 0 || loading || isTransitioning
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
            } transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500`}
          >
            &larr; Previous Email
          </button>
          
          <div className="text-sm text-gray-500">
            {loading ? 'Loading...' : emailData ? `Email ${currentIndex + 1} of ${emailData.totalEmails}` : ''}
            {prefetchingNext && <span className="ml-2 text-xs text-indigo-500">(Preloading more emails...)</span>}
          </div>
          
          <button
            onClick={handleNext}
            disabled={loading || !emailData || currentIndex >= emailData.totalEmails - 1 || isTransitioning}
            className={`px-4 py-2 rounded-md ${
              !emailData || currentIndex >= emailData.totalEmails - 1 || loading || isTransitioning
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
            } transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500`}
          >
            Next Email &rarr;
          </button>
        </div>
        
        {/* Email Content */}
        <div 
          className={`bg-white p-6 rounded-lg shadow-md transition-opacity duration-150 ${
            isTransitioning ? 'opacity-50' : 'opacity-100'
          }`}
        >
          {emailData && (
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
              {/* Email Header */}
              <div className="border-b border-gray-200 p-6 bg-gradient-to-r from-indigo-50 to-purple-50">
                <h2 className="text-xl font-bold mb-2 text-indigo-900">{emailData.email.subject}</h2>
                <p className="text-gray-800 mb-1">
                  <strong>From:</strong> {emailData.email.from[0].name} &lt;{emailData.email.from[0].email}&gt;
                </p>
                <p className="text-gray-800">
                  <strong>Date:</strong> {formatDate(emailData.email.date)}
                </p>
                
                {/* Email progress indicator */}
                <div className="mt-4">
                  <div className="flex justify-between text-sm text-gray-700 mb-1">
                    <span>Email {emailData.currentIndex + 1} of {emailData.totalEmails}</span>
                    <span>{Math.round(((emailData.currentIndex + 1) / emailData.totalEmails) * 100)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ width: `${((emailData.currentIndex + 1) / emailData.totalEmails) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
              
              {/* Email content sections */}
              <div className="p-6">
                {/* AI Summary */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-2 text-indigo-800 border-b border-indigo-200 pb-1">Summary</h3>
                  <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-md">
                    <p className="text-indigo-800">{emailData.summary}</p>
                  </div>
                </div>
                
                {/* Tasks Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-2 text-indigo-800 border-b border-indigo-200 pb-1">Tasks</h3>
                  {renderTasks()}
                </div>
                
                {/* Show/Hide Original Email Toggle */}
                <div className="border-t pt-4">
                  <button 
                    onClick={() => setExpandedView(!expandedView)}
                    className="text-indigo-600 hover:text-indigo-800 text-sm underline focus:outline-none font-medium"
                  >
                    {expandedView ? 'Hide original email' : 'Show original email'}
                  </button>
                  
                  {expandedView && (
                    <div className="mt-4 p-4 border border-indigo-200 rounded-md bg-white overflow-auto max-h-96">
                      {emailData.email.body ? (
                        <div className="text-indigo-900" dangerouslySetInnerHTML={formatEmailBody(emailData.email.body)} />
                      ) : (
                        <p className="text-red-600 italic">No email content available</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
