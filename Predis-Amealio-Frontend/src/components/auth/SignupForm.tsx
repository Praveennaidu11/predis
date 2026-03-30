'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { Eye, EyeOff, CheckCircle2, Circle } from "lucide-react";
import { useRouter } from "next/navigation";

interface SignupFormProps {
  initialRole?: 'merchant' | 'admin';
}

export default function SignupForm({ initialRole = 'merchant' }: SignupFormProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [userType, setUserType] = useState<"merchant" | "admin">(initialRole);
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isResendingOtp, setIsResendingOtp] = useState(false);
  const [showOtpDialog, setShowOtpDialog] = useState(false);
  const [timer, setTimer] = useState(120);
  const [step, setStep] = useState<"signup" | "otp">("signup");

  const passwordRules = {
    minLength: password.length >= 8,
    hasNumber: /\d/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };

  const passwordScore =
    (passwordRules.minLength ? 1 : 0) +
    (passwordRules.hasNumber ? 1 : 0) +
    (passwordRules.hasSpecial ? 1 : 0);

  const passwordStrengthPercent = Math.min(100, Math.round((passwordScore / 3) * 100));

  const passwordStrengthLabel =
    passwordScore === 3 ? "Strong" : passwordScore === 2 ? "Medium" : password.length > 0 ? "Weak" : "";

  const isPasswordValid = passwordScore === 3;
  const isConfirmMatch = confirmPassword.length === 0 ? true : password === confirmPassword;
  const showPasswordRequirements = true;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (showOtpDialog && timer > 0) {
      interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [showOtpDialog, timer]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid) {
      toast.error("Password is not strong enough", {
        description: "Use at least 8 characters with 1 number and 1 special character.",
      });
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setIsLoading(true);
    try {
      await apiClient.post("/auth/register", { fullName, email, password, companyName, role: userType });
      toast.success("OTP sent");
      setTimer(120);
      setShowOtpDialog(true);
      setStep("otp");
    } catch (error: any) {
      toast.error("Signup failed", { description: error.response?.data?.message || "Please try again" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) return;
    setIsVerifyingOtp(true);
    try {
      const response = await apiClient.post("/auth/verify-email-otp", { email, otp });
      const result = response.data;
      if (result.token) {
        localStorage.setItem('token', result.token);
        if (result.user) localStorage.setItem('user', JSON.stringify(result.user));
        window.dispatchEvent(new Event('storage'));
        toast.success("Account verified & Logged in successfully!");
        window.location.href = userType === 'admin' ? '/admin/dashboard' : '/merchant/dashboard';
      }
    } catch (error: any) {
      toast.error("OTP verification failed", { description: error.response?.data?.message || "Please try again" });
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    setIsResendingOtp(true);
    try {
      await apiClient.post("/auth/resend-email-otp", { email });
      toast.success("OTP resent");
      setTimer(120);
      setOtp("");
    } catch (error: any) {
      toast.error("Failed to resend OTP", {
        description: error.response?.data?.message || "Please try again",
      });
    } finally {
      setIsResendingOtp(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Join Amealio</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Button variant={userType === 'merchant' ? 'gradient' : 'outline'} onClick={() => setUserType('merchant')}>Merchant</Button>
            <Button variant={userType === 'admin' ? 'gradient' : 'outline'} onClick={() => setUserType('admin')}>Admin</Button>
          </div>
          {step === "signup" ? (
            <form onSubmit={handleSignup} className="space-y-4">
              <Label>Full Name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <div className="space-y-2">
              <Label>Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className={!isPasswordValid && password.length > 0 ? "border-red-300 focus-visible:ring-red-300" : ""}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {showPasswordRequirements && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Strength</span>
                    <span className={passwordScore === 3 ? "text-green-600" : passwordScore === 2 ? "text-amber-600" : "text-red-600"}>
                      {passwordStrengthLabel}
                    </span>
                  </div>
                  <Progress value={passwordStrengthPercent} />
                  <div className="grid gap-1 text-xs">
                    <div className="flex items-center gap-2">
                      {passwordRules.minLength ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className={passwordRules.minLength ? "text-foreground" : "text-muted-foreground"}>At least 8 characters</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {passwordRules.hasNumber ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className={passwordRules.hasNumber ? "text-foreground" : "text-muted-foreground"}>Contains a number</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {passwordRules.hasSpecial ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className={passwordRules.hasSpecial ? "text-foreground" : "text-muted-foreground"}>Contains a special character</span>
                    </div>
                  </div>

                  {!isPasswordValid && password.length > 0 && (
                    <p className="text-xs text-red-600">
                      Password must include at least 8 characters, 1 number, and 1 special character.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <div className="relative">
                <Input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className={!isConfirmMatch ? "border-red-300 focus-visible:ring-red-300" : ""}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {!isConfirmMatch && (
                <p className="text-xs text-red-600">Passwords do not match</p>
              )}
            </div>
              <Button
                className="w-full"
                variant="gradient"
                type="submit"
                disabled={isLoading || !isPasswordValid || password !== confirmPassword}
              >
                Create Account
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-lg font-semibold">Verify your email</div>
                <div className="text-sm text-muted-foreground">
                  Sent to <span className="font-medium">{email}</span>. Expires in {formatTime(timer)}.
                </div>
              </div>

              <Input
                className="text-center text-2xl tracking-[0.6em]"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                disabled={timer === 0}
                placeholder="Enter OTP"
              />

              <Button
                className="w-full"
                variant="gradient"
                disabled={isVerifyingOtp || otp.length !== 6 || timer === 0}
                onClick={handleVerifyOtp}
              >
                {isVerifyingOtp ? "Verifying..." : "Verify & Continue"}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {timer === 0 ? "OTP expired" : `Resend available in ${formatTime(timer)}`}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={timer > 0 || isResendingOtp}
                  onClick={handleResendOtp}
                >
                  {isResendingOtp ? "Resending..." : "Resend OTP"}
                </Button>
              </div>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep("signup");
                  setShowOtpDialog(false);
                  setOtp("");
                }}
              >
                Back
              </Button>
            </div>
          )}
          <div className="mt-4 text-center text-sm">Already have an account? <Link href="/login" className="text-primary hover:underline font-medium">Login</Link></div>
        </CardContent>
      </Card>
      {/* Keep Dialog for compatibility, but OTP UI is rendered inline above */}
      <Dialog open={showOtpDialog} onOpenChange={setShowOtpDialog}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <DialogTitle>Verify your email</DialogTitle>
            <DialogDescription>Sent to {email}. Expires in {formatTime(timer)}</DialogDescription>
          </DialogHeader>
          <Input className="text-center text-2xl tracking-[1em]" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} disabled={timer === 0} />
          <Button className="w-full" variant="gradient" disabled={isVerifyingOtp || otp.length !== 6 || timer === 0} onClick={handleVerifyOtp}>Verify & Sign Up</Button>
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-muted-foreground">
              {timer === 0 ? "OTP expired" : `Resend available in ${formatTime(timer)}`}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={timer > 0 || isResendingOtp}
              onClick={handleResendOtp}
            >
              {isResendingOtp ? "Resending..." : "Resend OTP"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
