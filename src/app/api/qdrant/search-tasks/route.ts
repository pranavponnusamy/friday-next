import { NextRequest, NextResponse } from 'next/server';
import { searchSimilarTasks } from '@/utils/qdrantClient';

export async function POST(req: NextRequest) {
  try {
    const { query, limit = 5 } = await req.json();

    // Validate required fields
    if (!query) {
      return NextResponse.json(
        { error: 'Missing required field: query is required' },
        { status: 400 }
      );
    }

    // Search for similar tasks
    const searchResults = await searchSimilarTasks(query, limit);

    return NextResponse.json({ 
      success: true, 
      results: searchResults 
    });
  } catch (error) {
    console.error('Error searching for similar tasks:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
