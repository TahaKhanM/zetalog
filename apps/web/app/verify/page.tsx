import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { userIdFromCookies } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

import { VerifyFlow } from './_components/VerifyFlow';
import { BrandMark } from '@/app/_components/BrandMark';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Verify university email' };

/** `/verify` — uni-email OTP flow (spec §7). Requires a signed-in account. */
export default async function VerifyPage(): Promise<React.JSX.Element> {
  const supabase = await createClient();
  if ((await userIdFromCookies(supabase)) === null) redirect('/signin?next=/verify');

  return (
    <div className="auth-page">
      <div className="card card--pad auth-card">
        <div className="auth-card__mark">
          <BrandMark variant="mark" size={32} />
        </div>
        <h1 className="display auth-card__title">University badge</h1>
        <VerifyFlow />
      </div>
    </div>
  );
}
