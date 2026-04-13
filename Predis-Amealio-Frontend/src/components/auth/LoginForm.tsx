'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import Link from 'next/link';
import { toast } from 'sonner';
import apiClient from '@/lib/api';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, CheckCircle2, Circle } from 'lucide-react';

interface LoginFormProps {
  initialRole?: 'merchant' | 'admin';
}

export default function LoginForm({ initialRole = 'merchant' }: LoginFormProps) {
  const router = useRouter();
  const [role, setRole] = useState<'merchant' | 'admin'>(initialRole);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [showForgotDialog, setShowForgotDialog] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [isForgotLoading, setIsForgotLoading] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [timer, setTimer] = useState(120);
  const backendBaseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8001';
  const startGoogleAuth = async () => {
    const url = `${backendBaseUrl}/api/auth/google?role=${encodeURIComponent(role)}`;
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'manual' as any });
      if (res.status === 503) {
        const data = await res.json().catch(() => null);
        toast.error('Google login is not configured', {
          description:
            data?.message ||
            'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend .env, then restart backend.',
        });
        return;
      }
      window.location.href = url;
    } catch {
      window.location.href = url;
    }
  };
  const startFacebookAuth = async () => {
    const url = `${backendBaseUrl}/api/auth/facebook?role=${encodeURIComponent(role)}`;
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'manual' as any });
      if (res.status === 503) {
        const data = await res.json().catch(() => null);
        toast.error('Facebook login is not configured', {
          description:
            data?.message ||
            'Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in backend .env, then restart backend.',
        });
        return;
      }
      window.location.href = url;
    } catch {
      window.location.href = url;
    }
  };

  const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.72 1.22 9.22 3.22l6.9-6.9C35.9 2.2 30.3 0 24 0 14.6 0 6.5 5.38 2.56 13.22l8.08 6.28C12.64 13.22 17.9 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M47.5 24c0-1.64-.15-3.22-.43-4.75H24v9h13.2c-.57 3.05-2.3 5.64-4.9 7.37l7.5 5.82C44.2 37.4 47.5 31.2 47.5 24z"/>
      <path fill="#FBBC05" d="M10.64 28.5A14.5 14.5 0 0 1 9.5 24c0-1.57.28-3.1.78-4.5l-8.08-6.28A23.98 23.98 0 0 0 0 24c0 3.9.93 7.6 2.56 10.78l8.08-6.28z"/>
      <path fill="#34A853" d="M24 48c6.3 0 11.6-2.08 15.47-5.64l-7.5-5.82c-2.08 1.4-4.75 2.24-7.97 2.24-6.1 0-11.36-3.72-13.36-8.9l-8.08 6.28C6.5 42.62 14.6 48 24 48z"/>
    </svg>
  );

  const FacebookIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.09 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.03 1.79-4.7 4.54-4.7 1.32 0 2.7.24 2.7.24v2.97h-1.52c-1.5 0-1.96.94-1.96 1.9v2.28h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.09 24 12.07z"
      />
    </svg>
  );

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (showResetDialog && timer > 0) {
      interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [showResetDialog, timer]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await apiClient.post('/auth/login', { email, password, role });
      const result = response.data;
      if (result.token) {
        localStorage.setItem('token', result.token);
        if (result.user) localStorage.setItem('user', JSON.stringify(result.user));
        window.dispatchEvent(new Event('storage'));
        toast.success('Login successful!');
        window.location.href = role === 'admin' ? '/admin/dashboard' : '/merchant/dashboard';
      }
    } catch (error: any) {
      const apiMsg = error.response?.data?.message;
      const description =
        typeof apiMsg === 'string' ? apiMsg : Array.isArray(apiMsg) ? apiMsg.join(' ') : 'Check credentials';
      toast.error('Login failed', { description });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsForgotLoading(true);
    try {
      await apiClient.post('/auth/forgot-password', { email: forgotEmail });
      toast.success('OTP sent');
      setShowForgotDialog(false);
      setTimer(120);
      setShowResetDialog(true);
    } catch (error: any) {
      toast.error('Error', { description: error.response?.data?.message || 'Failed' });
    } finally {
      setIsForgotLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsResetLoading(true);
    try {
      await apiClient.post('/auth/reset-password', { email: forgotEmail, otp: resetOtp, password: newPassword });
      toast.success('Password reset successful');
      setShowResetDialog(false);
    } catch (error: any) {
      toast.error('Error', { description: error.response?.data?.message || 'Failed' });
    } finally {
      setIsResetLoading(false);
    }
  };

  const passwordChecks = [
    { key: "length", label: "At least 8 characters", ok: newPassword.length >= 8 },
    { key: "number", label: "One number", ok: /\d/.test(newPassword) },
    { key: "special", label: "One special character", ok: /[^A-Za-z0-9]/.test(newPassword) },
  ];
  const passwordScore = passwordChecks.reduce((acc, c) => acc + (c.ok ? 1 : 0), 0);
  const passwordStrengthPercent = Math.round((passwordScore / 3) * 100);

  return (
    <Card className="w-full max-w-xl mx-auto">
      <CardHeader className="text-center">
        <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-lg">A</span>
        </div>
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <Button variant={role === 'merchant' ? 'gradient' : 'outline'} onClick={() => setRole('merchant')}>Merchant</Button>
          <Button variant={role === 'admin' ? 'gradient' : 'outline'} onClick={() => setRole('admin')}>Admin</Button>
        </div>
        <div className="grid gap-2 mb-4">
          <Button
            type="button"
            variant="outline"
            onClick={startGoogleAuth}
            className="w-full transition-all hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm"
          >
            <span className="flex items-center justify-center gap-2">
              <GoogleIcon />
              Continue with Google
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={startFacebookAuth}
            className="w-full transition-all hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm"
          >
            <span className="flex items-center justify-center gap-2">
              <FacebookIcon />
              Continue with Facebook
            </span>
          </Button>
          <div className="flex items-center gap-3 py-1">
            <div className="h-px bg-gray-200 flex-1" />
            <span className="text-xs text-gray-500">OR</span>
            <div className="h-px bg-gray-200 flex-1" />
          </div>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <div className="relative">
              <Input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={() => setShowForgotDialog(true)} className="text-sm text-primary hover:underline">Forgot password?</button>
          </div>
          <Button className="w-full" variant="gradient" type="submit" disabled={isLoading}>Sign In</Button>
        </form>
        <div className="mt-4 text-center text-sm">Don't have an account? <Link href="/signup" className="text-primary hover:underline font-medium">Sign up</Link></div>
      </CardContent>

      <Dialog open={showForgotDialog} onOpenChange={setShowForgotDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Reset Password</DialogTitle></DialogHeader>
          <form onSubmit={handleForgotPassword} className="space-y-4 py-4">
            <Label>Email Address</Label>
            <Input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required />
            <Button type="submit" className="w-full" variant="gradient" disabled={isForgotLoading}>Send OTP</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Verify & Reset</DialogTitle>
            <DialogDescription className="text-center">Expires in {formatTime(timer)}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4 py-2">
            <Input className="text-center text-2xl tracking-widest" maxLength={6} value={resetOtp} onChange={(e) => setResetOtp(e.target.value)} disabled={timer === 0} required />
            <Input type={showNewPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required disabled={timer === 0} />
            <Progress value={passwordStrengthPercent} className="h-1" />
            <Button type="submit" className="w-full" variant="gradient" disabled={isResetLoading || timer === 0}>Reset Password</Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
