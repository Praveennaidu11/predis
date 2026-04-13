import LoginForm from '@/components/auth/LoginForm';
import { Suspense } from 'react';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function LoginPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const raw = searchParams.role;
  const roleParam = Array.isArray(raw) ? raw[0] : raw;
  const roleFromUrl =
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
        {/* Remount when URL ?role= changes; do not sync role from props in an effect or tab clicks get overwritten. */}
        <LoginForm key={roleFromUrl} initialRole={roleFromUrl} />
      </Suspense>
    </div>
  );
}

