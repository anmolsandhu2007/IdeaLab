import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { accessConfig, verifySession } from '@/lib/auth';
import LoginForm from '@/components/login-form';
export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  const config = accessConfig();
  if (verifySession((await cookies()).get(config.cookieName)?.value, config)) redirect('/');
  return <LoginForm />;
}
