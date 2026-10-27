import Workspace from '@/components/workspace';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { accessConfig, verifySession } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const config = accessConfig();
  if (!verifySession((await cookies()).get(config.cookieName)?.value, config)) redirect('/login');
  return <Workspace />;
}
