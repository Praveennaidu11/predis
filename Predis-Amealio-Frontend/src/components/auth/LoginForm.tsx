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
      toast.error('Login failed', { description: error.response?.data?.message || 'Check credentials' });
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
    <Card className="w-full max-w-md mx-auto">
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
