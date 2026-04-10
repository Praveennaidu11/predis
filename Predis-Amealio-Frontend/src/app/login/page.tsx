import LoginForm from '@/components/auth/LoginForm';
import { Suspense } from 'react';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function LoginPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const roleParam = searchParams.role as string;
  const initialRole =
    roleParam === 'admin' || roleParam === 'merchant' ? roleParam : 'merchant';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="min-h-screen bg-background flex items-center justify-center p-4">
            Loading...
          </div>
        }
      >
        <LoginForm initialRole={initialRole} />
      </Suspense>
    </div>
  );
}

