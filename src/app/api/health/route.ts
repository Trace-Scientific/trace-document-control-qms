import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'trace-document-control-qms',
    timestamp: new Date().toISOString(),
  });
}
