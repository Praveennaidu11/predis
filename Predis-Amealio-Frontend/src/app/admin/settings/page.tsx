'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Save,
  Key,
  Mail,
  Loader2,
  Plus,
  Shield,
  MoreVertical,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  fetchAdminSettings,
  fetchAdminSettingsAdvanced,
  fetchAdminSettingsAudit,
  createAdminSetting,
  patchAdminSetting,
  deleteAdminSetting,
  type AdminSettingRow,
  type AdminSettingsAuditRow,
  upsertAdminSetting,
  isMaskedPlaceholder,
} from '@/lib/api/adminSettings';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

function actionBadgeClass(action: AdminSettingsAuditRow['action']): string {
  switch (action) {
    case 'create':
      return 'bg-emerald-500/10 text-emerald-700 border-emerald-200';
    case 'update':
      return 'bg-blue-500/10 text-blue-700 border-blue-200';
    case 'upsert':
      return 'bg-violet-500/10 text-violet-700 border-violet-200';
    case 'delete':
      return 'bg-rose-500/10 text-rose-700 border-rose-200';
    default:
      return '';
  }
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [advancedRows, setAdvancedRows] = useState<AdminSettingRow[]>([]);
  const [advancedSearch, setAdvancedSearch] = useState('');
  const [advancedCategory, setAdvancedCategory] = useState<string>('all');

  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState<'create' | 'edit'>('create');
  const [editRowId, setEditRowId] = useState<string | null>(null);
  const [editKey, setEditKey] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editIsEncrypted, setEditIsEncrypted] = useState(false);
  const [editValue, setEditValue] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<AdminSettingRow | null>(null);
  const [deleteConfirmKey, setDeleteConfirmKey] = useState('');

  const [auditLoading, setAuditLoading] = useState(false);
  const [auditRows, setAuditRows] = useState<AdminSettingsAuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditKeyFilter, setAuditKeyFilter] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState<'all' | AdminSettingsAuditRow['action']>('all');

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

  const loadAdvanced = useCallback(async () => {
    setAdvancedLoading(true);
    try {
      const rows = await fetchAdminSettingsAdvanced({
        search: advancedSearch || undefined,
        category: advancedCategory === 'all' ? undefined : advancedCategory,
        limit: 200,
        offset: 0,
      });
      setAdvancedRows(rows);
    } catch {
      toast.error('Failed to load settings (advanced)');
      setAdvancedRows([]);
    } finally {
      setAdvancedLoading(false);
    }
  }, [advancedCategory, advancedSearch]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetchAdminSettingsAudit({
        key: auditKeyFilter || undefined,
        action: auditActionFilter === 'all' ? undefined : auditActionFilter,
        limit: 100,
        offset: 0,
      });
      setAuditRows(res.rows);
      setAuditTotal(res.total);
    } catch {
      toast.error('Failed to load audit log');
      setAuditRows([]);
      setAuditTotal(0);
    } finally {
      setAuditLoading(false);
    }
  }, [auditActionFilter, auditKeyFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadAdvanced();
  }, [loadAdvanced]);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

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
      <div className="w-full px-4 md:px-8 py-4 md:py-6 space-y-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Platform settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure integrations, email, and platform defaults. Use <span className="font-medium">Advanced</span> for key/value CRUD and <span className="font-medium">Audit Log</span> for change history.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground rounded-lg border bg-card p-4">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading settings…
          </div>
        ) : (
          <Tabs defaultValue="ai" className="space-y-4">
            <TabsList className="w-full justify-start flex-wrap h-auto bg-muted/40">
              <TabsTrigger
                value="ai"
                className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:border-border data-[state=active]:shadow-sm"
              >
                AI Models
              </TabsTrigger>
              <TabsTrigger
                value="integrations"
                className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:border-border data-[state=active]:shadow-sm"
              >
                Integrations
              </TabsTrigger>
              <TabsTrigger
                value="email"
                className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:border-border data-[state=active]:shadow-sm"
              >
                Email
              </TabsTrigger>
              <TabsTrigger
                value="general"
                className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:border-border data-[state=active]:shadow-sm"
              >
                General
              </TabsTrigger>
              <TabsTrigger
                value="advanced"
                className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:border-border data-[state=active]:shadow-sm"
              >
                Advanced
              </TabsTrigger>
              <TabsTrigger
                value="audit"
                className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:border-border data-[state=active]:shadow-sm"
              >
                Audit Log
              </TabsTrigger>
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

            <TabsContent value="advanced">
              <Card>
                <CardHeader className="space-y-1">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle>Advanced</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Full key/value CRUD. Secret rows are always masked and never returned to the browser.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={loadAdvanced}
                        disabled={advancedLoading}
                      >
                        {advancedLoading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Refresh
                      </Button>
                      <Button
                        onClick={() => {
                          setEditMode('create');
                          setEditRowId(null);
                          setEditKey('');
                          setEditCategory('');
                          setEditIsEncrypted(false);
                          setEditValue('');
                          setEditOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        New
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <Separator />
                <CardContent className="space-y-4 pt-6">
                  <div className="flex flex-col md:flex-row md:items-end gap-3">
                    <div className="flex-1">
                      <Label>Search</Label>
                      <div className="relative">
                        <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                          className="pl-9"
                          value={advancedSearch}
                          onChange={(e) => setAdvancedSearch(e.target.value)}
                          placeholder="Search by key or category…"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') loadAdvanced();
                          }}
                        />
                      </div>
                    </div>
                    <div className="w-full md:w-64">
                      <Label>Category</Label>
                      <Select value={advancedCategory} onValueChange={setAdvancedCategory}>
                        <SelectTrigger>
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          {Array.from(
                            new Set(
                              advancedRows
                                .map((r) => r.category)
                                .filter((c): c is string => Boolean(c)),
                            ),
                          )
                            .sort()
                            .map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="text-sm text-muted-foreground md:pb-2">
                      {advancedRows.length} settings
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Key</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead className="text-right w-[72px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {advancedRows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">{r.key}</TableCell>
                          <TableCell>
                            {r.category ? (
                              <Badge variant="secondary">{r.category}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {r.isEncrypted ? (
                              <Badge variant="secondary" className="gap-1">
                                <Shield className="h-3 w-3" />
                                secret
                              </Badge>
                            ) : (
                              <span className="truncate block max-w-[520px]">
                                {r.value ?? <span className="text-muted-foreground">—</span>}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(r.updatedAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" aria-label="Row actions">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEditMode('edit');
                                    setEditRowId(r.id);
                                    setEditKey(r.key);
                                    setEditCategory(r.category ?? '');
                                    setEditIsEncrypted(r.isEncrypted);
                                    setEditValue(r.isEncrypted ? '' : r.value ?? '');
                                    setEditOpen(true);
                                  }}
                                >
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setDeleteTarget(r);
                                    setDeleteConfirmKey('');
                                  }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                      {advancedRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            {advancedLoading ? 'Loading…' : 'No settings found'}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editMode === 'create' ? 'Create setting' : 'Edit setting'}</DialogTitle>
                    <DialogDescription>
                      For secret values, enter a new value to replace it. Leaving it blank keeps the current secret.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3">
                    <div>
                      <Label>Key</Label>
                      <Input
                        value={editKey}
                        onChange={(e) => setEditKey(e.target.value)}
                        placeholder="general.platform_name"
                        disabled={editMode === 'edit'}
                      />
                    </div>
                    <div>
                      <Label>Category</Label>
                      <Input
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        placeholder="general"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id="isEncrypted"
                        type="checkbox"
                        checked={editIsEncrypted}
                        onChange={(e) => setEditIsEncrypted(e.target.checked)}
                      />
                      <Label htmlFor="isEncrypted">Treat as secret (masked)</Label>
                    </div>
                    <div>
                      <Label>Value</Label>
                      <Input
                        type={editIsEncrypted ? 'password' : 'text'}
                        autoComplete="off"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        placeholder={editIsEncrypted ? 'Enter new secret to replace' : 'Value'}
                      />
                      {editIsEncrypted ? (
                        <p className="text-xs text-muted-foreground mt-1">
                          Saving a mask-only value like <span className="font-mono">********</span> will be ignored.
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setEditOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          if (!editKey.trim()) {
                            toast.error('Key is required');
                            return;
                          }

                          if (editMode === 'create') {
                            await createAdminSetting({
                              key: editKey.trim(),
                              category: editCategory.trim() || undefined,
                              isEncrypted: editIsEncrypted,
                              value: editValue,
                            });
                            toast.success('Setting created');
                          } else if (editRowId) {
                            const payload: any = {
                              category: editCategory.trim() || null,
                              isEncrypted: editIsEncrypted,
                            };
                            // Only send value when user actually typed something (esp. for secrets).
                            if (editValue.trim().length > 0) payload.value = editValue;
                            if (editIsEncrypted && isMaskedPlaceholder(editValue)) delete payload.value;
                            await patchAdminSetting(editRowId, payload);
                            toast.success('Setting updated');
                          }
                          setEditOpen(false);
                          await Promise.all([loadAdvanced(), loadAudit(), load()]);
                        } catch (e: any) {
                          toast.error('Save failed', {
                            description: String(e?.response?.data?.message ?? e?.message ?? ''),
                          });
                        }
                      }}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete setting?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This is permanent. To confirm, type the key exactly:
                      <div className="mt-2 font-mono text-xs">{deleteTarget?.key}</div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-2">
                    <Label>Confirm key</Label>
                    <Input
                      value={deleteConfirmKey}
                      onChange={(e) => setDeleteConfirmKey(e.target.value)}
                      placeholder="Type the key to confirm"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setDeleteTarget(null)}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        if (!deleteTarget) return;
                        if (deleteConfirmKey !== deleteTarget.key) {
                          toast.error('Key does not match');
                          return;
                        }
                        try {
                          await deleteAdminSetting(deleteTarget.id);
                          toast.success('Setting deleted');
                          setDeleteTarget(null);
                          await Promise.all([loadAdvanced(), loadAudit(), load()]);
                        } catch {
                          toast.error('Delete failed');
                        }
                      }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </TabsContent>

            <TabsContent value="audit">
              <Card>
                <CardHeader>
                  <CardTitle>Audit log</CardTitle>
                </CardHeader>
                <Separator />
                <CardContent className="space-y-4 pt-6">
                  <div className="flex flex-col md:flex-row md:items-end gap-3">
                    <div className="flex-1">
                      <Label>Key</Label>
                      <Input
                        value={auditKeyFilter}
                        onChange={(e) => setAuditKeyFilter(e.target.value)}
                        placeholder="Exact key (optional)"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') loadAudit();
                        }}
                      />
                    </div>
                    <div className="w-full md:w-48">
                      <Label>Action</Label>
                      <Select
                        value={auditActionFilter}
                        onValueChange={(v) => setAuditActionFilter(v as any)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Action" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="create">create</SelectItem>
                          <SelectItem value="update">update</SelectItem>
                          <SelectItem value="upsert">upsert</SelectItem>
                          <SelectItem value="delete">delete</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2 md:pb-1">
                      <Button variant="outline" onClick={loadAudit} disabled={auditLoading}>
                        {auditLoading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Refresh
                      </Button>
                      <div className="text-sm text-muted-foreground">
                        {auditRows.length} / {auditTotal}
                      </div>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Key</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Change</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditRows.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(a.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={actionBadgeClass(a.action)}>
                              {a.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{a.settingKey}</TableCell>
                          <TableCell className="text-sm">
                            {a.actorEmail ?? a.actorUserId ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-sm">
                            {a.wasEncrypted || a.oldValueRedacted || a.newValueRedacted ? (
                              <span className="text-muted-foreground">Secret changed (redacted)</span>
                            ) : (
                              <span className="font-mono text-xs">
                                {String(a.oldValue ?? 'null')} → {String(a.newValue ?? 'null')}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {auditRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            {auditLoading ? 'Loading…' : 'No audit events'}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
