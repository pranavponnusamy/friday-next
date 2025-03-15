import { NextRequest, NextResponse } from 'next/server';
import { upsertTask } from '@/utils/qdrantClient';

export async function POST(req: NextRequest) {
  try {
    const { taskId, taskText, taskPayload } = await req.json();

    // Validate required fields
    if (!taskId || !taskText) {
      return NextResponse.json(
        { error: 'Missing required fields: taskId and taskText are required' },
        { status: 400 }
      );
    }

    // Validate payload
    if (!taskPayload || typeof taskPayload !== 'object') {
      return NextResponse.json(
        { error: 'Invalid payload: taskPayload must be an object' },
        { status: 400 }
      );
    }

    // Upsert task to Qdrant
    const result = await upsertTask(taskId, taskText, taskPayload);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to upsert task to Qdrant', details: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, taskId });
  } catch (error) {
    console.error('Error upserting task to Qdrant:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
