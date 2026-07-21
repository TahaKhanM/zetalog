import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * `POST /auth/signout` — clears the Supabase session and returns home. Uses 303
 * so the browser follows with a GET after the form POST.
 */
export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}
