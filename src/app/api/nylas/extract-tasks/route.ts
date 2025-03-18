import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { searchSimilarTasks } from '@/utils/qdrantClient';

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

// Task type enum
const TASK_TYPES = {
  MEETING_SCHEDULING: 'meeting_scheduling',
  REMINDER: 'reminder',
  TO_DO_ITEM: 'to_do_item'
};

interface Task {
  description: string;
  deadline: string | null;
  task_type: 'meeting_scheduling' | 'reminder' | 'to_do_item';
  priority: number;
  context: string;
}

interface TaskValidationResult {
  valid: boolean;
  error?: string;
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
  
  return { valid: true };
}

interface ParsedResponse {
  valid: boolean;
  summary?: string;
  tasks?: Task[];
  hasSchedulingRequest?: boolean;
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
    
    // Check for hasSchedulingRequest field
    const hasSchedulingRequest = typeof response.hasSchedulingRequest === 'boolean' 
      ? response.hasSchedulingRequest 
      : false;
    
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
      hasSchedulingRequest,
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

interface QdrantPoint {
  id: string | number;
  version?: number;
  score?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: Record<string, any> | null;
  vector?: number[] | null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface SimilarTask {
  payload: {
    description: string;
    priority: number;
    task_type: string;
    deadline: string | null;
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface SimilarTasksResult {
  success: boolean;
  tasks: QdrantPoint[];
  count?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error?: any;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Add prominent logging to help identify when this endpoint is called
  console.log("=========================================================");
  console.log("EXTRACT-TASKS API ENDPOINT CALLED");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("=========================================================");
  
  try {
    // Get cookies directly from the request headers
    const cookieHeader = request.headers.get('cookie') || '';
    const cookiePairs = cookieHeader.split(';').map(pair => pair.trim());
    
    // Parse cookies manually
    const cookieMap: Record<string, string> = {};
    cookiePairs.forEach(pair => {
      const [key, value] = pair.split('=');
      if (key && value) {
        cookieMap[key] = decodeURIComponent(value);
      }
    });
    
    const grantId = cookieMap['nylasGrantId'];
    
    if (!grantId) {
      return NextResponse.json({ error: 'Not authenticated with Nylas' }, { status: 401 });
    }
    
    // Get the email index from the query params
    const searchParams = request.nextUrl.searchParams;
    const emailIndex = parseInt(searchParams.get('index') || '0', 10);
    
    // Get the emails from the cookies
    const cachedEmailsStr = cookieMap['cachedEmails'];
    const cachedEmails = cachedEmailsStr ? JSON.parse(cachedEmailsStr) : [];
    
    if (emailIndex < 0 || emailIndex >= cachedEmails.length) {
      return NextResponse.json({ error: 'Invalid email index' }, { status: 400 });
    }
    
    const email = cachedEmails[emailIndex];
    
    // Search for similar tasks in Qdrant based on the email subject and body
    let similarTasksContext = '';
    try {
      const searchQuery = `${email.subject} ${email.body.substring(0, 500)}`;
      console.log(`Searching for similar tasks with query: ${searchQuery.substring(0, 100)}...`);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const similarTasksResult = await searchSimilarTasks(searchQuery, 5) as any;
      
      // Log the entire search results for debugging
      console.log('Similar tasks search result:');
      console.log(JSON.stringify(similarTasksResult, null, 2));
      
      if (similarTasksResult.success && similarTasksResult.tasks && similarTasksResult.tasks.length > 0) {
        // Format similar tasks as context for the LLM
        similarTasksContext = `\nSimilar existing tasks that might be relevant:\n`;
        
        // Log each similar task in detail
        console.log(`Found ${similarTasksResult.tasks.length} similar tasks:`);
        similarTasksResult.tasks.forEach((task: QdrantPoint, index: number) => {
          console.log(`Task ${index + 1}:`);
          console.log(`  ID: ${task.id}`);
          console.log(`  Score: ${task.score || 'N/A'}`);
          console.log(`  Payload: ${JSON.stringify(task.payload, null, 2)}`);
          
          // Add null checks for task.payload
          if (task.payload) {
            similarTasksContext += `${index + 1}. Description: ${task.payload.description || 'No description'}\n`;
            similarTasksContext += `   Priority: ${task.payload.priority || 'Not set'}\n`;
            similarTasksContext += `   Type: ${task.payload.task_type || 'Not specified'}\n`;
            if (task.payload.deadline) {
              similarTasksContext += `   Deadline: ${task.payload.deadline}\n`;
            }
            similarTasksContext += `\n`;
          }
        });
        
        console.log(`Similar tasks context added to prompt: \n${similarTasksContext}`);
      } else {
        console.log('No similar tasks found or search failed');
      }
    } catch (searchError) {
      console.error('Error searching for similar tasks:', searchError);
      // Continue without similar tasks if search fails
    }
    
    // Construct message for Gemini
    const prompt = `
I need you to analyze the following email and extract any tasks or action items that require follow-up.

Email Subject: ${email.subject}
Email From: ${email.from[0].name} <${email.from[0].email}>
Email Date: ${new Date(email.date * 1000).toLocaleString()}

Email Body:
${email.body}
${similarTasksContext}

Return your response as a JSON object with three fields: "summary", "tasks", and "hasSchedulingRequest". 

The "summary" field should contain the summary text.
The "tasks" field should contain a JSON array of task objects.
The "hasSchedulingRequest" field should be a boolean (true/false) indicating whether the email specifically mentions scheduling or setting up a meeting.

Each task object should have the following properties:
- description: A clear, concise description of what needs to be done
- deadline: When the task needs to be completed by (or null if not specified)
- task_type: The type of task, must be one of ["meeting_scheduling", "reminder", "to_do_item"]
- priority: A priority level from 1-5, where 5 is highest priority. Make sure that the priority is always super low unless it's a super pressing and time sensitive event. Most tasks should be 1 or 2.
- context: Any additional relevant context for the task (meeting links, etc.)

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
    const parsedResponse = parseCombinedResponse(responseText);
    
    if (!parsedResponse.valid) {
      return NextResponse.json({ 
        error: parsedResponse.error,
        rawResponse: parsedResponse.rawResponse
      }, { status: 400 });
    }
    
    // Prepare response object with emailId to help client-side caching
    const responseObject = {
      summary: parsedResponse.summary,
      tasks: parsedResponse.tasks,
      hasTaskErrors: parsedResponse.hasTaskErrors,
      taskErrors: parsedResponse.taskErrors || [],
      hasSchedulingRequest: parsedResponse.hasSchedulingRequest || false,
      similarTasks: similarTasksContext ? true : false,
      email: {
        id: email.id, // Include the email ID for client-side caching
        subject: email.subject,
        from: email.from[0],
        date: email.date
      }
    };
    
    return NextResponse.json(responseObject);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error parsing email';
    console.error('Error extracting tasks:', errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
