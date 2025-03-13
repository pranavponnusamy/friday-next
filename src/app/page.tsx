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
        <div className="bg-white p-8 rounded-lg shadow-md max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold text-indigo-700 mb-6 text-center">Friday Next</h1>
          
          <div className="text-center mb-10">
            <p className="text-lg text-gray-700 mb-6">
              Extract tasks from your emails and schedule them on your calendar with AI assistance
            </p>
            
            {userGrantId ? (
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="bg-green-50 p-4 rounded-full w-12 h-12 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-green-800">
                  Connected as <span className="font-semibold">{userEmail ? userEmail : 'Nylas User'}</span>
                </p>
                <Link
                  href="/email-summary"
                  className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-8 rounded-md transition-colors text-center"
                >
                  Go to Email Summary
                </Link>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-6">
                <div className="bg-indigo-50 p-4 rounded-full w-12 h-12 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <p className="text-gray-700">
                  Connect your account to get started
                </p>
                <Link
                  href="/api/nylas/auth"
                  className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-8 rounded-md transition-colors text-center"
                >
                  Login with Nylas
                </Link>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-indigo-600 mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-800">Email Analysis</h3>
              <p className="text-gray-600 mt-2">Process your emails with AI to extract important information and tasks</p>
            </div>
            
            <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-indigo-600 mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-800">Task Extraction</h3>
              <p className="text-gray-600 mt-2">Automatically identify and prioritize action items from your communication</p>
            </div>
            
            <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-indigo-600 mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-800">Smart Scheduling</h3>
              <p className="text-gray-600 mt-2">Schedule tasks on your calendar with intelligent conflict detection across multiple calendars</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
