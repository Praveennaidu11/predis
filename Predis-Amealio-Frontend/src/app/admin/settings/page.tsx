'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Save, Key, Mail, Loader2 } from 'lucide-react';
import {
  fetchAdminSettings,
  upsertAdminSetting,
  isMaskedPlaceholder,
} from '@/lib/api/adminSettings';

const KEYS = {
  openaiKey: 'ai.openai_api_key',
  anthropicKey: 'ai.anthropic_api_key',
  googleKey: 'ai.google_api_key',
  msg91Key: 'integrations.msg91_auth_key',
  razorpayKey: 'integrations.razorpay_key_id',
  razorpaySecret: 'integrations.razorpay_key_secret',
  smtpHost: 'email.smtp_host',
  smtpPort: 'email.smtp_port',
  smtpUser: 'email.smtp_user',
  smtpPassword: 'email.smtp_password',
  platformName: 'general.platform_name',
  supportEmail: 'general.support_email',
} as const;

type FormState = {
  openaiKey: string;
  anthropicKey: string;
  googleKey: string;
  msg91Key: string;
  razorpayKey: string;
  razorpaySecret: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  platformName: string;
  supportEmail: string;
};

const emptyForm: FormState = {
  openaiKey: '',
  anthropicKey: '',
  googleKey: '',
  msg91Key: '',
  razorpayKey: '',
  razorpaySecret: '',
  smtpHost: '',
  smtpPort: '',
  smtpUser: '',
  smtpPassword: '',
  platformName: '',
  supportEmail: '',
};

function mapRowsToForm(
  rows: { key: string; value: string | null }[],
): FormState {
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ''])) as Record<
    string,
    string
  >;
  return {
    openaiKey: m[KEYS.openaiKey] ?? '',
    anthropicKey: m[KEYS.anthropicKey] ?? '',
    googleKey: m[KEYS.googleKey] ?? '',
    msg91Key: m[KEYS.msg91Key] ?? '',
    razorpayKey: m[KEYS.razorpayKey] ?? '',
    razorpaySecret: m[KEYS.razorpaySecret] ?? '',
    smtpHost: m[KEYS.smtpHost] ?? '',
    smtpPort: m[KEYS.smtpPort] ?? '',
    smtpUser: m[KEYS.smtpUser] ?? '',
    smtpPassword: m[KEYS.smtpPassword] ?? '',
    platformName: m[KEYS.platformName] ?? '',
    supportEmail: m[KEYS.supportEmail] ?? '',
  };
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchAdminSettings();
      setSettings(mapRowsToForm(rows));
    } catch {
      toast.error('Failed to load settings');
      setSettings(emptyForm);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const upsertField = async (
    formKey: keyof FormState,
    category: string,
    isSecret: boolean,
  ) => {
    const value = settings[formKey];
    if (isSecret && isMaskedPlaceholder(value)) return;
    await upsertAdminSetting({
      key: KEYS[formKey],
      value,
      category,
      isEncrypted: isSecret,
    });
  };

  const saveAi = async () => {
    setSaving('ai');
    try {
      await upsertField('openaiKey', 'ai', true);
      await upsertField('anthropicKey', 'ai', true);
      await upsertField('googleKey', 'ai', true);
      toast.success('AI settings saved');
      await load();
    } catch {
      toast.error('Could not save AI settings');
    } finally {
      setSaving(null);
    }
  };

  const saveIntegrations = async () => {
    setSaving('integrations');
    try {
      await upsertField('msg91Key', 'integrations', true);
      await upsertField('razorpayKey', 'integrations', true);
      await upsertField('razorpaySecret', 'integrations', true);
      toast.success('Integration settings saved');
      await load();
    } catch {
      toast.error('Could not save integrations');
    } finally {
      setSaving(null);
    }
  };

  const saveEmail = async () => {
    setSaving('email');
    try {
      await upsertField('smtpHost', 'email', false);
      await upsertField('smtpPort', 'email', false);
      await upsertField('smtpUser', 'email', false);
      await upsertField('smtpPassword', 'email', true);
      toast.success('Email settings saved');
      await load();
    } catch {
      toast.error('Could not save email settings');
    } finally {
      setSaving(null);
    }
  };

  const saveGeneral = async () => {
    setSaving('general');
    try {
      await upsertField('platformName', 'general', false);
      await upsertField('supportEmail', 'general', false);
      toast.success('General settings saved');
      await load();
    } catch {
      toast.error('Could not save general settings');
    } finally {
      setSaving(null);
    }
  };

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-3xl font-bold mb-8">Platform Settings</h1>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading settings…
          </div>
        ) : (
          <Tabs defaultValue="ai" className="space-y-6">
            <TabsList>
              <TabsTrigger value="ai">AI Models</TabsTrigger>
              <TabsTrigger value="integrations">Integrations</TabsTrigger>
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="general">General</TabsTrigger>
            </TabsList>

            <TabsContent value="ai">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    AI Model API Keys
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>OpenAI API Key</Label>
                    <Input
                      type="password"
                      autoComplete="off"
                      value={settings.openaiKey}
                      onChange={(e) =>
                        setSettings({ ...settings, openaiKey: e.target.value })
                      }
                      placeholder="sk-..."
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      For GPT-4o, GPT-5, DALL-E models
                    </p>
                  </div>

                  <div>
                    <Label>Anthropic API Key</Label>
                    <Input
                      type="password"
                      autoComplete="off"
                      value={settings.anthropicKey}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          anthropicKey: e.target.value,
                        })
                      }
                      placeholder="sk-ant-..."
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      For Claude Sonnet models
                    </p>
                  </div>

                  <div>
                    <Label>Google AI API Key</Label>
                    <Input
                      type="password"
                      autoComplete="off"
                      value={settings.googleKey}
                      onChange={(e) =>
                        setSettings({ ...settings, googleKey: e.target.value })
                      }
                      placeholder="AIza..."
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      For Gemini models
                    </p>
                  </div>

                  <Button onClick={saveAi} disabled={saving === 'ai'}>
                    {saving === 'ai' ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save AI Settings
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="integrations">
              <Card>
                <CardHeader>
                  <CardTitle>Third-Party Integrations</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">
                      MSG91 (SMS & WhatsApp)
                    </h3>
                    <div>
                      <Label>Auth Key</Label>
                      <Input
                        type="password"
                        autoComplete="off"
                        value={settings.msg91Key}
                        onChange={(e) =>
                          setSettings({ ...settings, msg91Key: e.target.value })
                        }
                        placeholder="Enter MSG91 auth key"
                      />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t">
                    <h3 className="font-semibold text-lg">
                      Razorpay (Payments)
                    </h3>
                    <div>
                      <Label>Key ID</Label>
                      <Input
                        type="password"
                        autoComplete="off"
                        value={settings.razorpayKey}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            razorpayKey: e.target.value,
                          })
                        }
                        placeholder="rzp_..."
                      />
                    </div>
                    <div>
                      <Label>Key Secret</Label>
                      <Input
                        type="password"
                        autoComplete="off"
                        value={settings.razorpaySecret}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            razorpaySecret: e.target.value,
                          })
                        }
                        placeholder="Secret key"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={saveIntegrations}
                    disabled={saving === 'integrations'}
                  >
                    {saving === 'integrations' ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Integration Settings
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="email">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Email Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>SMTP Host</Label>
                      <Input
                        value={settings.smtpHost}
                        onChange={(e) =>
                          setSettings({ ...settings, smtpHost: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>SMTP Port</Label>
                      <Input
                        value={settings.smtpPort}
                        onChange={(e) =>
                          setSettings({ ...settings, smtpPort: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <Label>SMTP Username</Label>
                    <Input
                      value={settings.smtpUser}
                      onChange={(e) =>
                        setSettings({ ...settings, smtpUser: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <Label>SMTP Password</Label>
                    <Input
                      type="password"
                      autoComplete="off"
                      value={settings.smtpPassword}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          smtpPassword: e.target.value,
                        })
                      }
                    />
                  </div>

                  <Button onClick={saveEmail} disabled={saving === 'email'}>
                    {saving === 'email' ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Email Settings
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="general">
              <Card>
                <CardHeader>
                  <CardTitle>General Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Platform Name</Label>
                    <Input
                      value={settings.platformName}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          platformName: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div>
                    <Label>Support Email</Label>
                    <Input
                      type="email"
                      value={settings.supportEmail}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          supportEmail: e.target.value,
                        })
                      }
                    />
                  </div>

                  <Button onClick={saveGeneral} disabled={saving === 'general'}>
                    {saving === 'general' ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save General Settings
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
