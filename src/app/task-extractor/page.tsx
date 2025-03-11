'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface Task {
  description: string;
  deadline: string | null;
  task_type: string;
  priority: number;
  context: string;
}

interface TasksResponse {
  summary: string;
  tasks: Task[];
  hasTaskErrors: boolean;
  taskErrors: string[];
  email: {
    subject: string;
    from: { name: string; email: string };
    date: number;
  };
}

export default function TaskExtractor() {
  const searchParams = useSearchParams();
  const emailIndex = searchParams.get('index') || '0';
  
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasksData, setTasksData] = useState<TasksResponse | null>(null);

  useEffect(() => {
    extractTasks();
  }, [emailIndex]);

  const extractTasks = async () => {
    try {
      setLoading(true);
      setExtracting(true);
      setError(null);
      
      const response = await fetch(`/api/nylas/extract-tasks?index=${emailIndex}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to extract tasks');
      }
      
      const data = await response.json();
      setTasksData(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred while extracting tasks');
      console.error('Error extracting tasks:', err);
    } finally {
      setLoading(false);
      setExtracting(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  // Function to return appropriate badge color based on task type
  const getTaskTypeBadgeColor = (taskType: string) => {
    switch (taskType) {
      case 'meeting_scheduling':
        return 'bg-blue-100 text-blue-800';
      case 'reminder':
        return 'bg-purple-100 text-purple-800';
      case 'to_do_item':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Function to return readable task type
  const getReadableTaskType = (taskType: string) => {
    switch (taskType) {
      case 'meeting_scheduling':
        return 'Meeting';
      case 'reminder':
        return 'Reminder';
      case 'to_do_item':
        return 'To-Do';
      default:
        return taskType;
    }
  };

  // Function to return priority stars
  const getPriorityStars = (priority: number) => {
    const maxPriority = 5;
    let stars = '';
    
    for (let i = 0; i < maxPriority; i++) {
      stars += i < priority ? '★' : '☆';
    }
    
    return stars;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="text-lg text-gray-600">
          {extracting ? 'Extracting tasks with AI...' : 'Loading...'}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 p-8">
        <div className="container mx-auto max-w-4xl">
          <div className="bg-red-50 p-6 rounded-md border border-red-200 mb-6">
            <p className="text-red-800 mb-4">{error}</p>
            <Link 
              href="/email-summary"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              Return to Emails
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Extracted Tasks</h1>
          <Link 
            href="/email-summary"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            Return to Emails
          </Link>
        </div>
        
        {tasksData && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="email-header mb-4 p-4 bg-gray-50 rounded-md">
              <h2 className="text-xl font-semibold mb-2">{tasksData.email.subject}</h2>
              <p className="text-sm text-gray-600 mb-1">
                <strong>From:</strong> {tasksData.email.from.name} &lt;{tasksData.email.from.email}&gt;
              </p>
              <p className="text-sm text-gray-600">
                <strong>Date:</strong> {formatDate(tasksData.email.date)}
              </p>
            </div>
            
            <div className="summary mb-6 p-4 bg-blue-50 rounded-md">
              <h3 className="text-lg font-semibold mb-2 text-blue-900">Summary</h3>
              <p className="text-blue-800">{tasksData.summary}</p>
            </div>
            
            <div className="tasks">
              <h3 className="text-lg font-semibold mb-4 text-gray-800">
                Tasks ({tasksData.tasks.length})
              </h3>
              
              {tasksData.tasks.length === 0 ? (
                <div className="p-4 bg-gray-50 rounded-md text-gray-600">
                  No tasks were extracted from this email.
                </div>
              ) : (
                <div className="space-y-4">
                  {tasksData.tasks.map((task, index) => (
                    <div key={index} className="p-4 border border-gray-200 rounded-md hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-gray-800 mb-2">{task.description}</h4>
                          <div className="flex flex-wrap gap-2 mb-2">
                            <span className={`inline-block px-2 py-1 text-xs rounded-full ${getTaskTypeBadgeColor(task.task_type)}`}>
                              {getReadableTaskType(task.task_type)}
                            </span>
                            {task.deadline && (
                              <span className="inline-block px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
                                Due: {task.deadline}
                              </span>
                            )}
                          </div>
                          {task.context && (
                            <p className="text-sm text-gray-600 mt-2">{task.context}</p>
                          )}
                        </div>
                        <div className="text-amber-500 font-medium">
                          {getPriorityStars(task.priority)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {tasksData.hasTaskErrors && (
                <div className="mt-4 p-4 bg-red-50 rounded-md">
                  <h4 className="font-semibold text-red-800 mb-2">Task Validation Errors</h4>
                  <ul className="list-disc pl-5 text-red-700 text-sm">
                    {tasksData.taskErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
