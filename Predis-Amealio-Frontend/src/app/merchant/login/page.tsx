'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MerchantLoginPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login?role=merchant');
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      Loading...
    </div>
  );
}
