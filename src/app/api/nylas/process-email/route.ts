import { NextRequest, NextResponse } from 'next/server';
import Nylas from 'nylas';
import { cookies } from 'next/headers';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
});

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseMimeType: "application/json",
};

// Initialize Nylas with configuration
const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY || '',
  apiUri: process.env.NYLAS_API_URI || 'https://api.us.nylas.com',
});

// Server-side cache for emails and processed results
// We'll use Maps to store the data with the Nylas grant ID as the key
interface EmailCache {
  emails: NylasEmail[];
  lastFetched: number; // Timestamp when emails were last fetched
  processedEmails: Map<number, ProcessedEmailResponse>; // Map of processed emails by index
}

// Main cache object - keys are grantIds
const emailCache = new Map<string, EmailCache>();

// Cache expiration time in milliseconds (15 minutes)
const CACHE_EXPIRATION = 15 * 60 * 1000;

// Task type enum
const TASK_TYPES = {
  MEETING_SCHEDULING: 'meeting_scheduling',
  REMINDER: 'reminder',
  TO_DO_ITEM: 'to_do_item'
};

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

interface Task {
  description: string;
  deadline: string | null;
  task_type: 'meeting_scheduling' | 'reminder' | 'to_do_item';
  priority: number;
  context: string;
  duration: number; // Estimated duration in minutes
}

interface TaskValidationResult {
  valid: boolean;
  error?: string;
}

// For processed email responses
interface ProcessedEmailResponse {
  email: NylasEmail;
  summary: string;
  tasks: Task[];
  currentIndex: number;
  totalEmails: number;
  isMock?: boolean;
  error?: string;
  hasTaskErrors?: boolean;
  taskErrors?: string[];
  rawResponse?: string;
}

// Simplified task validation
function validateTask(task: unknown): TaskValidationResult {
  // Basic structure check
  if (!task || typeof task !== 'object') {
    return { valid: false, error: 'Task must be an object' };
  }
  
  const taskObj = task as Record<string, unknown>;
  
  // Required fields
  if (!taskObj.description || typeof taskObj.description !== 'string') {
    return { valid: false, error: 'Task must have a description as a string' };
  }
  
  // Task type validation
  if (!taskObj.task_type || !Object.values(TASK_TYPES).includes(taskObj.task_type as string)) {
    return { valid: false, error: `Task type must be one of: ${Object.values(TASK_TYPES).join(', ')}` };
  }
  
  // Ensure duration is a number if present (default to 30 minutes if missing)
  if (taskObj.duration !== undefined && (typeof taskObj.duration !== 'number' || taskObj.duration <= 0)) {
    return { valid: false, error: 'Duration must be a positive number of minutes' };
  }
  
  return { valid: true };
}

interface ParsedResponse {
  valid: boolean;
  summary?: string;
  tasks?: Task[];
  error?: string;
  rawResponse?: string;
  hasTaskErrors?: boolean;
  taskErrors?: string[];
}

// Parse combined summary and tasks from JSON response
function parseCombinedResponse(responseText: string): ParsedResponse {
  try {
    // Try to parse the JSON response
    const response = JSON.parse(responseText) as Record<string, unknown>;
    
    // Validate summary field
    if (!response.summary || typeof response.summary !== 'string') {
      return {
        valid: false,
        error: 'Response must have a "summary" field as a string',
        rawResponse: responseText
      };
    }
    
    // Validate tasks field
    if (!Array.isArray(response.tasks)) {
      return {
        valid: false,
        error: 'Response must have a "tasks" field as an array',
        rawResponse: responseText
      };
    }
    
    // Validate each task
    const validTasks: Task[] = [];
    const errors: string[] = [];
    
    response.tasks.forEach((task: unknown, index: number) => {
      const validation = validateTask(task);
      if (validation.valid) {
        validTasks.push(task as Task);
      } else {
        errors.push(`Task ${index + 1}: ${validation.error}`);
      }
    });
    
    return {
      valid: true,
      summary: response.summary,
      tasks: validTasks,
      hasTaskErrors: errors.length > 0,
      taskErrors: errors
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      valid: false,
      error: `Failed to parse JSON: ${errorMessage}`,
      rawResponse: responseText
    };
  }
}

// Mock data for testing or when Nylas/AI is not available
const mockEmails: NylasEmail[] = [
  {
    id: 'mock-1',
    subject: 'Project Deadline Update',
    from: [{ email: 'manager@example.com', name: 'Project Manager' }],
    date: Math.floor(Date.now() / 1000),
    body: '<p>Hello team,</p><p>This is a reminder that our project deadline has been moved up to next Friday. Please make sure all deliverables are ready by Thursday EOD for final review.</p><p>Best regards,<br>Project Manager</p>'
  },
  {
    id: 'mock-2',
    subject: 'Team Meeting Tomorrow',
    from: [{ email: 'team-lead@example.com', name: 'Team Lead' }],
    date: Math.floor(Date.now() / 1000),
    body: '<p>Hi everyone,</p><p>Don\'t forget we have our weekly team meeting tomorrow at 10 AM. Please prepare updates on your current tasks and any blockers you\'re facing.</p><p>Regards,<br>Team Lead</p>'
  }
];

// Helper function to fetch emails from Nylas
async function fetchEmailsFromNylas(grantId: string): Promise<NylasEmail[]> {
  try {
    // Fetch messages from the Nylas API using the messages.list method
    const messagesResponse = await nylas.messages.list({
      identifier: grantId,
      queryParams: {
        limit: 100,
      },
    });
    
    // Process the response, which might have different formats
    let emails: NylasEmail[] = [];
    
    try {
      // First try: check if response has a data property with an array
      if (messagesResponse && typeof messagesResponse === 'object' && 'data' in messagesResponse) {
        const data = messagesResponse.data;
        if (Array.isArray(data)) {
          emails = data as unknown as NylasEmail[];
          console.log(`Successfully fetched ${emails.length} emails from data property`);
        }
      } else {
        // Second try: check if we can iterate over the response
        try {
          // Check if the response is iterable
          if (messagesResponse && Symbol.iterator in Object(messagesResponse)) {
            emails = Array.from(messagesResponse as Iterable<unknown>) as unknown as NylasEmail[];
            console.log(`Successfully fetched ${emails.length} emails using iteration`);
          }
        } catch (iterError) {
          console.warn("Iterator approach failed:", iterError);
          
          // Last attempt - check if it's directly an array
          if (Array.isArray(messagesResponse)) {
            emails = messagesResponse as unknown as NylasEmail[];
            console.log(`Successfully fetched ${emails.length} emails from array response`);
          }
        }
      }
    } catch (parseError) {
      console.error("Error parsing Nylas response:", parseError);
    }
    
    return emails;
  } catch (error) {
    console.error("Error fetching emails from Nylas:", error);
    return [];
  }
}

// Helper function to process a single email with AI
async function processEmailWithAI(email: NylasEmail): Promise<ParsedResponse> {
  try {
    // Construct message for Gemini
    const prompt = `
I need you to analyze the following email and provide two things:
1. A short, concise summary of the email (3-5 sentences max)
2. Extract any tasks or action items that require follow-up

Email Subject: ${email.subject}
Email From: ${email.from && email.from[0] ? `${email.from[0].name} <${email.from[0].email}>` : 'Unknown Sender'}
Email Date: ${new Date(email.date * 1000).toLocaleString()}

Email Body:
${email.body}

Return your response as a JSON object with two fields: "summary" and "tasks". The "summary" field should contain the summary text, and the "tasks" field should contain a JSON array of task objects.

Each task object should have the following properties:
- description: A clear, concise description of what needs to be done
- deadline: When the task needs to be completed by (or null if not specified)
- task_type: The type of task, must be one of ["meeting_scheduling", "reminder", "to_do_item"]
- priority: A priority level from 1-5, where 5 is highest priority
- context: Any additional relevant context for the task
- duration: Estimated time needed to complete the task in minutes (e.g., 30, 60, 120)

For the duration field, analyze the complexity of the task and provide a reasonable estimate. For example:
- Quick tasks like sending a brief email might be 15-30 minutes
- Meeting preparation might be 60 minutes
- More complex tasks might be 120+ minutes

Format your response ONLY as valid JSON with these fields, nothing else.
`;
    
    // Start chat session with Gemini
    const chatSession = model.startChat({
      generationConfig,
      history: [],
    });
    
    const result = await chatSession.sendMessage(prompt);
    const responseText = result.response.text();
    
    // Parse the response
    return parseCombinedResponse(responseText);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("AI processing error:", error);
    
    return {
      valid: false,
      error: `AI processing failed: ${errorMessage}`
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get the index from the query parameters
    const { searchParams } = new URL(request.url);
    const index = parseInt(searchParams.get('index') || '0', 10);
    const forceRefresh = searchParams.get('refresh') === 'true';
    
    // Get cookies to check for Nylas grant ID
    const cookieStore = await cookies();
    const grantId = cookieStore.get('nylasGrantId')?.value;
    
    // If no grant ID, return mock data with a summary and tasks
    if (!grantId) {
      console.log("No Nylas grant ID found, using mock data");
      
      const mockEmail = mockEmails[index % mockEmails.length];
      
      // Mock summary and tasks for the mock email
      const mockSummary = "This email is a reminder about an upcoming deadline or meeting.";
      const mockTasks = [
        {
          description: "Prepare deliverables by Thursday EOD",
          deadline: "Thursday EOD",
          task_type: "to_do_item",
          priority: 5,
          context: "For final project review",
          duration: 120 // 2 hours
        }
      ];
      
      return NextResponse.json({ 
        email: mockEmail,
        summary: mockSummary,
        tasks: mockTasks,
        currentIndex: index,
        totalEmails: mockEmails.length,
        isMock: true
      });
    }
    
    console.log("Using grant ID:", grantId);
    
    // Check if we have cached data for this grant ID
    const now = Date.now();
    let userEmailCache = emailCache.get(grantId);
    
    // If no cache exists, or cache is expired, or force refresh is requested, fetch fresh data
    if (!userEmailCache || (now - userEmailCache.lastFetched > CACHE_EXPIRATION) || forceRefresh) {
      console.log("Cache miss or expired, fetching fresh emails from Nylas");
      
      // Fetch emails from Nylas
      const emails = await fetchEmailsFromNylas(grantId);
      
      if (emails.length > 0) {
        // Create or update the cache
        userEmailCache = {
          emails: emails,
          lastFetched: now,
          processedEmails: new Map()
        };
        
        // Store in cache
        emailCache.set(grantId, userEmailCache);
      } else {
        console.warn("No emails found in Nylas response, using mock data");
        
        // Return mock data if no emails found
        return NextResponse.json({ 
          email: mockEmails[index % mockEmails.length],
          summary: "This is a mock email summary since no real emails were found.",
          tasks: [{
            description: "Connect your email account properly",
            deadline: "As soon as possible",
            task_type: "to_do_item",
            priority: 5,
            context: "To see your real emails and tasks",
            duration: 30 // 30 minutes
          }],
          currentIndex: index,
          totalEmails: mockEmails.length,
          isMock: true
        });
      }
    } else {
      console.log("Using cached emails, last fetched:", new Date(userEmailCache.lastFetched).toLocaleString());
    }
    
    // Now we should have a valid cache
    const emails = userEmailCache!.emails;
    
    // Make sure index is within bounds
    const safeIndex = Math.min(index, emails.length - 1);
    const email = emails[safeIndex];
    
    // Check if we have already processed this email
    if (userEmailCache!.processedEmails.has(safeIndex) && !forceRefresh) {
      console.log(`Using cached processed email for index ${safeIndex}`);
      
      // Return the cached processed email
      return NextResponse.json(userEmailCache!.processedEmails.get(safeIndex));
    }
    
    // Process the email if it's not in the cache
    console.log(`Processing email #${safeIndex + 1}: ${email.subject}`);
    
    // Process the email with AI
    const parsedResponse = await processEmailWithAI(email);
    
    let response: ProcessedEmailResponse;
    
    if (!parsedResponse.valid) {
      console.error("Invalid AI response:", parsedResponse.error);
      
      // Return the email with an error for the summary/tasks
      response = { 
        email: email,
        summary: "Error generating summary",
        tasks: [],
        error: parsedResponse.error,
        currentIndex: safeIndex,
        totalEmails: emails.length,
        rawResponse: parsedResponse.rawResponse
      };
    } else {
      // Successful AI processing
      response = {
        email: email,
        summary: parsedResponse.summary || "",
        tasks: parsedResponse.tasks || [],
        hasTaskErrors: parsedResponse.hasTaskErrors,
        taskErrors: parsedResponse.taskErrors || [],
        currentIndex: safeIndex,
        totalEmails: emails.length
      };
    }
    
    // Cache the processed result
    userEmailCache!.processedEmails.set(safeIndex, response);
    
    // Return the response
    return NextResponse.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error in GET handler:", error);
    
    // Fallback to mock data on error
    return NextResponse.json({ 
      email: mockEmails[0],
      summary: "An error occurred while processing your emails.",
      tasks: [{
        description: "Check your Nylas API connection",
        deadline: "As soon as possible",
        task_type: "to_do_item",
        priority: 5,
        context: `Error: ${errorMessage}`,
        duration: 15 // 15 minutes
      }],
      currentIndex: 0,
      totalEmails: 1,
      isMock: true,
      error: errorMessage
    }, { status: 500 });
  }
}
