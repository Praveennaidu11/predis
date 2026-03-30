import SignupForm from '@/components/auth/SignupForm';
import { Suspense } from 'react';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function SignupPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const roleParam = searchParams.role as string;
  const initialRole = (roleParam === 'admin' || roleParam === 'merchant') ? roleParam : 'merchant';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center p-4">Loading...</div>}>
        <SignupForm initialRole={initialRole} />
      </Suspense>
    </div>
  );
}
