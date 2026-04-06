'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { brandsApi, Brand, CreateBrandDto, UpdateBrandDto } from '@/lib/api/brands';

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizeHex(value: string) {
  const v = value.trim();
  if (!v) return '';
  return v.startsWith('#') ? v : `#${v}`;
}

export default function MerchantBrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateBrandDto>({
    name: '',
    primaryColor: '',
    secondaryColor: '',
    fontFamily: '',
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [editForm, setEditForm] = useState<UpdateBrandDto>({});

  const sortedBrands = useMemo(
    () => [...brands].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [brands],
  );

  const fetchBrands = async () => {
    try {
      setLoading(true);
      const { data } = await brandsApi.list();
      setBrands(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to load brands');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBrands();
  }, []);

  const validateBrandInputs = (name: string, primaryColor?: string, secondaryColor?: string) => {
    if (!name.trim()) return 'Brand name is required';
    if (primaryColor && primaryColor.trim() && !HEX.test(normalizeHex(primaryColor))) {
      return 'Primary color must be a hex like #fff or #ffffff';
    }
    if (secondaryColor && secondaryColor.trim() && !HEX.test(normalizeHex(secondaryColor))) {
      return 'Secondary color must be a hex like #fff or #ffffff';
    }
    return null;
  };

  const onCreate = async () => {
    const err = validateBrandInputs(createForm.name, createForm.primaryColor, createForm.secondaryColor);
    if (err) return toast.error(err);

    try {
      const dto: CreateBrandDto = {
        name: createForm.name.trim(),
        primaryColor: createForm.primaryColor?.trim() ? normalizeHex(createForm.primaryColor) : undefined,
        secondaryColor: createForm.secondaryColor?.trim() ? normalizeHex(createForm.secondaryColor) : undefined,
        fontFamily: createForm.fontFamily?.trim() || undefined,
      };
      const { data } = await brandsApi.create(dto);
      setBrands((prev) => [data, ...prev]);
      setCreateOpen(false);
      setCreateForm({ name: '', primaryColor: '', secondaryColor: '', fontFamily: '' });
      toast.success('Brand created');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to create brand');
    }
  };

  const openEdit = (b: Brand) => {
    setEditing(b);
    setEditForm({
      name: b.name,
      primaryColor: b.primaryColor || '',
      secondaryColor: b.secondaryColor || '',
      fontFamily: b.fontFamily || '',
    });
    setEditOpen(true);
  };

  const onSaveEdit = async () => {
    if (!editing) return;
    const err = validateBrandInputs(
      String(editForm.name || ''),
      String(editForm.primaryColor || ''),
      String(editForm.secondaryColor || ''),
    );
    if (err) return toast.error(err);

    try {
      const dto: UpdateBrandDto = {
        name: String(editForm.name || '').trim(),
        primaryColor: String(editForm.primaryColor || '').trim()
          ? normalizeHex(String(editForm.primaryColor))
          : undefined,
        secondaryColor: String(editForm.secondaryColor || '').trim()
          ? normalizeHex(String(editForm.secondaryColor))
          : undefined,
        fontFamily: String(editForm.fontFamily || '').trim() || undefined,
      };
      const { data } = await brandsApi.update(editing.id, dto);
      setBrands((prev) => prev.map((x) => (x.id === data.id ? data : x)));
      setEditOpen(false);
      setEditing(null);
      toast.success('Brand updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to update brand');
    }
  };

  const onDelete = async (b: Brand) => {
    if (!confirm(`Delete brand "${b.name}"? Existing content will keep working (brand becomes empty).`)) return;
    try {
      await brandsApi.remove(b.id);
      setBrands((prev) => prev.filter((x) => x.id !== b.id));
      toast.success('Brand deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to delete brand');
    }
  };

  const onUploadLogo = async (b: Brand, file: File) => {
    try {
      const { data } = await brandsApi.uploadLogo(b.id, file);
      setBrands((prev) => prev.map((x) => (x.id === data.id ? data : x)));
      toast.success('Logo updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to upload logo');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Brands</h1>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>Create brand</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Create brand</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium mb-1">Name</div>
                  <Input
                    value={createForm.name}
                    onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Amealio"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-sm font-medium mb-1">Primary color</div>
                    <Input
                      value={createForm.primaryColor || ''}
                      onChange={(e) => setCreateForm((p) => ({ ...p, primaryColor: e.target.value }))}
                      placeholder="#0B82E6"
                    />
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-1">Secondary color</div>
                    <Input
                      value={createForm.secondaryColor || ''}
                      onChange={(e) => setCreateForm((p) => ({ ...p, secondaryColor: e.target.value }))}
                      placeholder="#001D51"
                    />
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium mb-1">Typography</div>
                  <Input
                    value={createForm.fontFamily || ''}
                    onChange={(e) => setCreateForm((p) => ({ ...p, fontFamily: e.target.value }))}
                    placeholder="e.g. Inter"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={onCreate}>Create</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : sortedBrands.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No brands yet</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Create your first brand to reuse identity (logo/colors/typography) across content.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedBrands.map((b) => (
              <Card key={b.id}>
                <CardHeader className="space-y-1">
                  <CardTitle className="flex items-center justify-between gap-3">
                    <span className="truncate">{b.name}</span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(b)}>
                        Edit
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => onDelete(b)}>
                        Delete
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-lg border overflow-hidden bg-white flex items-center justify-center">
                      {b.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.logo} alt="logo" className="h-full w-full object-cover" />
                      ) : (
                        <div className="text-xs text-muted-foreground">No logo</div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-xs text-muted-foreground mb-1">Upload logo</div>
                      <Input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          onUploadLogo(b, file);
                          e.currentTarget.value = '';
                        }}
                      />
                      <div className="text-[11px] text-muted-foreground mt-1">PNG/JPEG/WEBP up to 2MB</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="border rounded-md p-2">
                      <div className="text-muted-foreground">Primary</div>
                      <div className="font-medium truncate">{b.primaryColor || '—'}</div>
                    </div>
                    <div className="border rounded-md p-2">
                      <div className="text-muted-foreground">Secondary</div>
                      <div className="font-medium truncate">{b.secondaryColor || '—'}</div>
                    </div>
                    <div className="border rounded-md p-2">
                      <div className="text-muted-foreground">Font</div>
                      <div className="font-medium truncate">{b.fontFamily || '—'}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Edit brand</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium mb-1">Name</div>
                <Input
                  value={String(editForm.name || '')}
                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-sm font-medium mb-1">Primary color</div>
                  <Input
                    value={String(editForm.primaryColor || '')}
                    onChange={(e) => setEditForm((p) => ({ ...p, primaryColor: e.target.value }))}
                    placeholder="#0B82E6"
                  />
                </div>
                <div>
                  <div className="text-sm font-medium mb-1">Secondary color</div>
                  <Input
                    value={String(editForm.secondaryColor || '')}
                    onChange={(e) => setEditForm((p) => ({ ...p, secondaryColor: e.target.value }))}
                    placeholder="#001D51"
                  />
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-1">Typography</div>
                <Input
                  value={String(editForm.fontFamily || '')}
                  onChange={(e) => setEditForm((p) => ({ ...p, fontFamily: e.target.value }))}
                  placeholder="e.g. Inter"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={onSaveEdit}>Save</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

