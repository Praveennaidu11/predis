'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    const role = searchParams.get('role') || 'merchant';
    const error = searchParams.get('error');

    if (error) {
      toast.error('Authentication failed', { description: error });
      router.push('/login');
      return;
    }

    if (token) {
      localStorage.setItem('token', token);
      // Trigger storage event for components that listen to it
      window.dispatchEvent(new Event('storage'));
      toast.success('Logged in successfully!');
      
      // Redirect based on role
      if (role === 'admin') {
        router.push('/admin/dashboard');
      } else {
        router.push('/merchant/dashboard');
      }
    } else {
      toast.error('No authentication token received');
      router.push('/login');
    }
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
        <p className="text-gray-600 font-medium">Completing login...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
      </div>
    }>
      <AuthCallbackInner />
    </Suspense>
  );
}
