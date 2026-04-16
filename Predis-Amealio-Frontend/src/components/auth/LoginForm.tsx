'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import Link from 'next/link';
import { toast } from 'sonner';
import apiClient from '@/lib/api';
import { Eye, EyeOff, Mail, Phone } from 'lucide-react';

interface LoginFormProps {
  initialRole?: 'merchant' | 'admin';
}

export default function LoginForm({ initialRole = 'merchant' }: LoginFormProps) {
  const [role, setRole] = useState<'merchant' | 'admin'>(initialRole);
  const [activeTab, setActiveTab] = useState<'phone' | 'email'>('phone');

  const backendBaseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8001';
  const startGoogleAuth = async () => {
    const url = `${backendBaseUrl}/api/auth/google?role=${encodeURIComponent(role)}`;
    // Direct redirect so the browser can follow the provider flow.
    window.location.href = url;
  };

  const startFacebookAuth = async () => {
    const url = `${backendBaseUrl}/api/auth/facebook?role=${encodeURIComponent(role)}`;
    // Direct redirect so the browser can follow the provider flow.
    window.location.href = url;
  };

  const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.72 1.22 9.22 3.22l6.9-6.9C35.9 2.2 30.3 0 24 0 14.6 0 6.5 5.38 2.56 13.22l8.08 6.28C12.64 13.22 17.9 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M47.5 24c0-1.64-.15-3.22-.43-4.75H24v9h13.2c-.57 3.05-2.3 5.64-4.9 7.37l7.5 5.82C44.2 37.4 47.5 31.2 47.5 24z"
      />
      <path
        fill="#FBBC05"
        d="M10.64 28.5A14.5 14.5 0 0 1 9.5 24c0-1.57.28-3.1.78-4.5l-8.08-6.28A23.98 23.98 0 0 0 0 24c0 3.9.93 7.6 2.56 10.78l8.08-6.28z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.3 0 11.6-2.08 15.47-5.64l-7.5-5.82c-2.08 1.4-4.75 2.24-7.97 2.24-6.1 0-11.36-3.72-13.36-8.9l-8.08 6.28C6.5 42.62 14.6 48 24 48z"
      />
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

  // Phone OTP flow
  const [countryCode, setCountryCode] = useState('+91');
  const [mobileNumber, setMobileNumber] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [otpStage, setOtpStage] = useState<'request' | 'verify'>('request');
  const [isOtpLoading, setIsOtpLoading] = useState(false);

  // Email/password flow (existing)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);

  const canRequestOtp = useMemo(() => {
    const digits = mobileNumber.replace(/[^\d]/g, '');
    return digits.length >= 8 && String(countryCode || '').trim().length > 0;
  }, [mobileNumber, countryCode]);

  const canVerifyOtp = otp.length === 6 && !!userId;

  const persistSessionAndRedirect = async (token: string) => {
    localStorage.setItem('token', token);
    try {
      const validated = await apiClient.get('/validate-token');
      const user = validated.data?.user;
      if (user) {
        localStorage.setItem('user', JSON.stringify(user));
        window.dispatchEvent(new Event('storage'));
      }
    } catch {
      // If validate-token fails, still keep token; user can retry on next request.
    }
    window.location.href = role === 'admin' ? '/admin/dashboard' : '/merchant/dashboard';
  };

  const requestOtp = async () => {
    setIsOtpLoading(true);
    try {
      const res = await apiClient.patch('/otp-authentication', {
        strategy: 'phone',
        mobile_number: mobileNumber,
        country_code: countryCode,
        deviceId: navigator.userAgent,
        deviceType: 'web',
        deviceName: 'web',
        deviceVersion: navigator.appVersion || 'web',
        deviceUniqId: navigator.userAgent,
        deviceSystemVersion: navigator.platform || 'web',
      });
      const nextUserId = res.data?.user_id;
      if (!nextUserId) throw new Error('Missing user_id from OTP response');
      setUserId(String(nextUserId));
      setOtp('');
      setOtpStage('verify');
      toast.success('OTP sent');
    } catch (error: any) {
      const apiMsg = error.response?.data?.message;
      const description =
        typeof apiMsg === 'string' ? apiMsg : Array.isArray(apiMsg) ? apiMsg.join(' ') : 'Failed to send OTP';
      toast.error('Could not send OTP', { description });
    } finally {
      setIsOtpLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!userId) return;
    setIsOtpLoading(true);
    try {
      const res = await apiClient.get('/otp-authentication', {
        params: { user_id: userId, OTP: otp },
      });
      const authHeader: string | undefined =
        res.headers?.authorization || res.headers?.Authorization || res.headers?.AUTHORIZATION;
      const headerToken = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
      const bodyToken = String((res.data?.token || res.data?.accessToken || '') ?? '').trim().replace(/^Bearer\s+/i, '');
      const token = headerToken || bodyToken;
      if (!token) throw new Error('Missing Authorization token');
      toast.success('Login successful');
      await persistSessionAndRedirect(token);
    } catch (error: any) {
      const apiMsg = error.response?.data?.message;
      const description =
        typeof apiMsg === 'string' ? apiMsg : Array.isArray(apiMsg) ? apiMsg.join(' ') : 'Invalid OTP';
      toast.error('OTP verification failed', { description });
    } finally {
      setIsOtpLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsEmailLoading(true);
    try {
      const response = await apiClient.post('/auth/login', { email, password, role });
      const result = response.data;
      if (result?.token) {
        toast.success('Login successful');
        localStorage.setItem('token', result.token);
        if (result.user) localStorage.setItem('user', JSON.stringify(result.user));
        window.dispatchEvent(new Event('storage'));
        window.location.href = role === 'admin' ? '/admin/dashboard' : '/merchant/dashboard';
      } else {
        throw new Error('Missing token');
      }
    } catch (error: any) {
      const apiMsg = error.response?.data?.message;
      const description =
        typeof apiMsg === 'string' ? apiMsg : Array.isArray(apiMsg) ? apiMsg.join(' ') : 'Check credentials';
      toast.error('Login failed', { description });
    } finally {
      setIsEmailLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-xl mx-auto">
      <CardContent className="p-6 sm:p-8">
        <div className="max-w-sm mx-auto">
          <div className="text-center space-y-1 mb-6">
            <div className="text-2xl font-semibold">Welcome to Amealio</div>
            <div className="text-sm text-muted-foreground">Sign in to continue</div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <Button
              type="button"
              variant={role === 'merchant' ? 'gradient' : 'outline'}
              onClick={() => setRole('merchant')}
            >
              Merchant
            </Button>
            <Button
              type="button"
              variant={role === 'admin' ? 'gradient' : 'outline'}
              onClick={() => setRole('admin')}
            >
              Admin
            </Button>
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

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
            <TabsList className="!grid w-full grid-cols-2 gap-3 !h-auto !p-0 !border-0 bg-transparent">
              <TabsTrigger
                value="phone"
                className="flex items-center justify-center gap-2 rounded-lg border border-input bg-background py-2 text-sm font-medium shadow-sm text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-md"
              >
                <Phone className="h-4 w-4" />
                Phone Number
              </TabsTrigger>
              <TabsTrigger
                value="email"
                className="flex items-center justify-center gap-2 rounded-lg border border-input bg-background py-2 text-sm font-medium shadow-sm text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-md"
              >
                <Mail className="h-4 w-4" />
                Email
              </TabsTrigger>
            </TabsList>

                <TabsContent value="phone" className="mt-5 space-y-4">
                  {otpStage === 'request' ? (
                    <>
                      <div className="space-y-2">
                        <Label>Country Code</Label>
                        <Input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} placeholder="+91" />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone Number</Label>
                        <Input
                          inputMode="numeric"
                          value={mobileNumber}
                          onChange={(e) => setMobileNumber(e.target.value.replace(/[^\d]/g, ''))}
                          placeholder="8074377281"
                        />
                      </div>
                      <Button
                        type="button"
                        className="w-full"
                        variant="gradient"
                        disabled={!canRequestOtp || isOtpLoading}
                        onClick={requestOtp}
                      >
                        {isOtpLoading ? 'Sending OTP…' : 'Send OTP'}
                      </Button>
                      <div className="text-center text-sm text-muted-foreground">
                        Not having an account?{' '}
                        <Link href="/signup" className="text-primary hover:underline font-medium">
                          Sign Up
                        </Link>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label>Enter OTP</Label>
                        <div className="flex justify-center">
                          <InputOTP
                            maxLength={6}
                            value={otp}
                            onChange={(v) => setOtp(v.replace(/[^\d]/g, ''))}
                          >
                            <InputOTPGroup>
                              {Array.from({ length: 6 }).map((_, i) => (
                                <InputOTPSlot key={i} index={i} />
                              ))}
                            </InputOTPGroup>
                          </InputOTP>
                        </div>
                        <div className="text-xs text-muted-foreground text-center">
                          OTP sent to {countryCode}
                          {mobileNumber}
                        </div>
                      </div>

                      <Button
                        type="button"
                        className="w-full"
                        variant="gradient"
                        disabled={!canVerifyOtp || isOtpLoading}
                        onClick={verifyOtp}
                      >
                        {isOtpLoading ? 'Verifying…' : 'Log In'}
                      </Button>

                      <div className="flex items-center justify-between text-sm">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isOtpLoading}
                          onClick={requestOtp}
                        >
                          Resend OTP
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={isOtpLoading}
                          onClick={() => {
                            setOtpStage('request');
                            setOtp('');
                            setUserId(null);
                          }}
                        >
                          Change number
                        </Button>
                      </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="email" className="mt-5">
                  <form onSubmit={handleEmailLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label>E-mail Address</Label>
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Password</Label>
                      <div className="relative">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <Button className="w-full" variant="gradient" type="submit" disabled={isEmailLoading}>
                      {isEmailLoading ? 'Logging in…' : 'Log In'}
                    </Button>
                    <div className="text-center text-sm text-muted-foreground">
                      Not having an account?{' '}
                      <Link href="/signup" className="text-primary hover:underline font-medium">
                        Sign Up
                      </Link>
                    </div>
                  </form>
                </TabsContent>
          </Tabs>

          <div className="mt-6 text-center text-xs text-muted-foreground">
            Need help?{' '}
            <a className="text-primary hover:underline" href="mailto:support@amealio.com">
              Contact support
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
