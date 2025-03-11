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

// Task type enum
const TASK_TYPES = {
  MEETING_SCHEDULING: 'meeting_scheduling',
  REMINDER: 'reminder',
  TO_DO_ITEM: 'to_do_item'
};

// Simplified task validation
function validateTask(task: any) {
  // Basic structure check
  if (!task || typeof task !== 'object') {
    return { valid: false, error: 'Task must be an object' };
  }
  
  // Required fields
  if (!task.description || typeof task.description !== 'string') {
    return { valid: false, error: 'Task must have a description as a string' };
  }
  
  // Task type validation
  if (!task.task_type || !Object.values(TASK_TYPES).includes(task.task_type)) {
    return { valid: false, error: `Task type must be one of: ${Object.values(TASK_TYPES).join(', ')}` };
  }
  
  return { valid: true };
}

// Parse combined summary and tasks from JSON response
function parseCombinedResponse(responseText: string) {
  try {
    // Try to parse the JSON response
    const response = JSON.parse(responseText);
    
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
    const validTasks: any[] = [];
    const errors: string[] = [];
    
    response.tasks.forEach((task: any, index: number) => {
      const validation = validateTask(task);
      if (validation.valid) {
        validTasks.push(task);
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
  } catch (error: any) {
    return {
      valid: false,
      error: `Failed to parse JSON: ${error.message}`,
      rawResponse: responseText
    };
  }
}

// Initialize Nylas with configuration
const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY || '',
  apiUri: process.env.NYLAS_API_URI || 'https://api.us.nylas.com',
});

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const grantId = cookieStore.get('nylasGrantId')?.value;
    
    if (!grantId) {
      return NextResponse.json({ error: 'Not authenticated with Nylas' }, { status: 401 });
    }
    
    // Get the email index from the query params
    const searchParams = request.nextUrl.searchParams;
    const emailIndex = parseInt(searchParams.get('index') || '0', 10);
    
    // Get the emails from the cookies
    const cachedEmailsStr = cookieStore.get('cachedEmails')?.value;
    const cachedEmails = cachedEmailsStr ? JSON.parse(cachedEmailsStr) : [];
    
    if (emailIndex < 0 || emailIndex >= cachedEmails.length) {
      return NextResponse.json({ error: 'Invalid email index' }, { status: 400 });
    }
    
    const email = cachedEmails[emailIndex];
    
    // Construct message for Gemini
    const prompt = `
I need you to analyze the following email and extract any tasks or action items that require follow-up.

Email Subject: ${email.subject}
Email From: ${email.from[0].name} <${email.from[0].email}>
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
    
    return NextResponse.json({
      summary: parsedResponse.summary,
      tasks: parsedResponse.tasks,
      hasTaskErrors: parsedResponse.hasTaskErrors,
      taskErrors: parsedResponse.taskErrors || [],
      email: {
        subject: email.subject,
        from: email.from[0],
        date: email.date
      }
    });
  } catch (error: any) {
    console.error("Error extracting tasks:", error);
    return NextResponse.json({ error: `Failed to extract tasks: ${error.message}` }, { status: 500 });
  }
}
