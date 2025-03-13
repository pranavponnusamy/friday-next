import { cookies } from 'next/headers';
import Link from "next/link";

export default async function Home() {
  // Get cookies from the server
  const cookieStore = await cookies();
  const userGrantId = cookieStore.get('nylasGrantId')?.value;
  const userEmail = cookieStore.get('nylasUserEmail')?.value;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="w-full px-4 py-8">
        <div className="bg-white p-8 rounded-lg shadow-md">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Nylas Email Task Extractor</h1>
          
          {userGrantId ? (
            <div className="bg-green-50 p-6 rounded-md border border-green-200 mb-6">
              <p className="text-green-800 mb-4">
                ✅ You are authenticated with Nylas{userEmail ? ` as ${userEmail}` : ''}.
              </p>
              <Link
                href="/email-summary"
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-md transition-colors"
              >
                View Email Summaries
              </Link>
            </div>
          ) : (
            <div className="bg-red-50 p-6 rounded-md border border-red-200 mb-6">
              <p className="text-red-800 mb-4">
                You are not authenticated with Nylas. Please connect your account to get started.
              </p>
              <Link
                href="/api/nylas/auth"
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-md transition-colors"
              >
                Connect Nylas Account
              </Link>
            </div>
          )}

          <div className="mt-8">
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">About This App</h2>
            <p className="text-gray-600 mb-4">
              This application helps you extract tasks and action items from your emails using 
              Nylas API integration and Gemini AI. Connect your email account to get started.
            </p>
            <p className="text-gray-600 mb-4">
              Once connected, you can browse through your recent emails and use AI to analyze them 
              for tasks, meetings, and reminders.
            </p>
          </div>
          
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="text-lg font-medium text-gray-700 mb-3">Features:</h3>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Connect securely to your email account</li>
              <li>Browse recent emails in your inbox</li>
              <li>AI-powered task extraction from email content</li>
              <li>Categorize tasks by type (meetings, reminders, to-dos)</li>
              <li>Prioritize tasks based on importance</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
