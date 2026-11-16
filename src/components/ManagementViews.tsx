import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Plus,
  Trash2,
  Sparkles,
  Grid2x2,
  Printer,
  Users,
  Receipt,
  Building2,
  History,
  Star,
  Settings as SettingsIcon,
  Check,
  RotateCcw,
  Upload,
  Image as ImageIcon,
  QrCode,
  CheckCircle2,
  AlertCircle,
  CalendarClock,
  Shield,
  Lock,
  FileText,
  Ban,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import { MENU_IMAGE_PRESETS } from '../data/seedData';
import type {
  BranchConfig,
  CatalogItemType,
  MenuItem,
  PosOrder,
  PosTable,
  StaffRole,
} from '../types/pos';
import { isMerchantKhqrConfigured } from '../utils/bakongKhqr';
import {
  ALL_PERMISSIONS,
  canAssignRole,
  canEditSettings,
  canGrantPermission,
  canManageOwnerGrants,
  DEFAULT_OWNER_TENANT_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  getEffectivePermissions,
  OWNER_GRANTABLE_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  ROLE_LABELS,
  type PermissionKey,
} from '../utils/permissions';
import {
  SUBSCRIPTION_PLAN_LIST,
  type SubscriptionPlan,
} from '../utils/subscription';
import { compressImageFileToDataUrl } from '../utils/imageHelper';
import { isDemoStaffAccount } from '../utils/tenantAccess';
import {
  COMPANY_LOGO_ICONS,
  createDefaultInvoiceTemplate,
  INVOICE_ACCENT_STYLES,
  INVOICE_TEMPLATE_STYLES,
  MAX_COMPANY_LOGO_URL_LENGTH,
  normalizeInvoiceTemplate,
  type CompanyLogoIcon,
  type InvoiceAccentColor,
  type InvoiceQrFooterMode,
  type InvoiceTemplateConfig,
} from '../utils/invoiceTemplate';
import { CompanyIconGlyph, CompanyLogoBadge } from './CompanyLogoBadge';
import { QrCodeBox } from './QrCodeBox';
import { ReceiptInvoiceDocument } from './ReceiptInvoiceDocument';
import { SubscriptionKhqrCard } from './SubscriptionKhqrCard';
import { TenantRegistrationModal } from './TenantRegistrationModal';

export function MenuManagementView() {
  const { state, activeBranch, saveMenuItem, deleteMenuItem, importMenuItems } = usePos();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | CatalogItemType>('all');
  const [editing, setEditing] = useState<Partial<MenuItem> | null>(null);
  const [imageError, setImageError] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [rawImportText, setRawImportText] = useState(
    'Khmer Mango Salad, 5.50, Starters\nIced Matcha Latte, 3.25, Coffee & Drinks'
  );
  const [importLoading, setImportLoading] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<
    {
      nameEn: string;
      nameKh: string;
      nameVi: string;
      category: string;
      priceUsd: number;
      station: 'kitchen' | 'bar';
    }[]
  >([]);

  const items = useMemo(
    () =>
      state.menuItems.filter((m) => {
        if (m.branchId !== activeBranch.id) return false;
        const itemType: CatalogItemType = m.itemType === 'service' ? 'service' : 'product';
        if (typeFilter !== 'all' && itemType !== typeFilter) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return m.nameEn.toLowerCase().includes(q) || m.category.toLowerCase().includes(q);
      }),
    [state.menuItems, activeBranch.id, search, typeFilter]
  );

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    setImageError('');
    setImageLoading(true);
    try {
      const compressed = await compressImageFileToDataUrl(file);
      setEditing({ ...editing, imageUrl: compressed });
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Unable to process image.');
    } finally {
      setImageLoading(false);
      e.target.value = '';
    }
  };

  const handleSaveDish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.nameEn?.trim()) return;
    const itemType: CatalogItemType = editing.itemType === 'service' ? 'service' : 'product';
    saveMenuItem({
      id: editing.id,
      itemType,
      nameEn: editing.nameEn.trim(),
      nameKh: editing.nameKh || editing.nameEn.trim(),
      nameVi: editing.nameVi || editing.nameEn.trim(),
      description: editing.description,
      category: editing.category || (itemType === 'service' ? 'Services' : 'Main dishes'),
      priceUsd: Math.max(0.25, Number(editing.priceUsd) || 3.5),
      station: editing.station || 'kitchen',
      imageUrl: editing.imageUrl?.trim() || undefined,
      active: editing.active ?? true,
      isBestSeller: editing.isBestSeller ?? false,
    });
    setEditing(null);
    setImageError('');
  };

  const handleRunAiImport = async () => {
    setImportLoading(true);
    try {
      const res = await fetch('/api/ai/menu-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: rawImportText }),
      });
      const data = (await res.json()) as { items?: typeof parsedPreview };
      setParsedPreview(data.items || []);
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Products, services &amp; prices</h1>
          <p className="text-xs text-slate-500">
            Manage product &amp; service items with photos, trilingual names (EN / KH / VI), and KDS routing
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
          >
            <Sparkles className="h-3.5 w-3.5" /> Import Menu
          </button>
          <button
            type="button"
            onClick={() => {
              setImageError('');
              setEditing({
                itemType: 'service',
                nameEn: '',
                category: 'Services',
                priceUsd: 10.0,
                station: 'bar',
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add Service
          </button>
          <button
            type="button"
            onClick={() => {
              setImageError('');
              setEditing({
                itemType: 'product',
                nameEn: '',
                category: 'Main dishes',
                priceUsd: 4.5,
                station: 'kitchen',
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-900"
          >
            <Plus className="h-3.5 w-3.5" /> Add Product
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products, services, or category..."
              className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
            />
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
              {(['all', 'product', 'service'] as const).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTypeFilter(tf)}
                  className={`rounded-md px-3 py-1 capitalize ${
                    typeFilter === tf ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tf === 'all' ? 'All items' : tf === 'product' ? 'Products' : 'Services'}
                </button>
              ))}
            </div>
          </div>
          <span className="text-xs text-slate-500 tabular-nums">{items.length} items</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-3 font-semibold">Image</th>
                <th className="py-2 pr-3 font-semibold">Item</th>
                <th className="py-2 pr-3 font-semibold">Type</th>
                <th className="py-2 pr-3 font-semibold">Category</th>
                <th className="py-2 pr-3 font-semibold">Station</th>
                <th className="py-2 pr-3 font-semibold text-right">Price USD</th>
                <th className="py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((m) => {
                const isSvc = m.itemType === 'service';
                return (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="py-2 pr-3">
                      {m.imageUrl ? (
                        <img
                          src={m.imageUrl}
                          alt={m.nameEn}
                          referrerPolicy="no-referrer"
                          className="h-10 w-10 rounded-lg object-cover border border-slate-200"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center font-bold text-amber-800">
                          {m.initials}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-semibold text-slate-900">{m.nameEn}</div>
                      <div className="text-[11px] text-slate-500">{m.nameKh}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          isSvc ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'
                        }`}
                      >
                        {isSvc ? 'Service' : 'Product'}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{m.category}</td>
                    <td className="py-2 pr-3 uppercase font-mono text-[11px]">{m.station}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                      ${m.priceUsd.toFixed(2)}
                    </td>
                    <td className="py-2 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setImageError('');
                          setEditing(m);
                        }}
                        className="text-emerald-800 font-semibold hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMenuItem(m.id)}
                        className="text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editing.id ? 'Edit product or service item' : 'New product or service item'}
        >
          <form
            onSubmit={handleSaveDish}
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-3 text-xs max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-emerald-800" />
                {editing.id ? 'Edit catalog item' : 'New product or service item'}
              </h3>

              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 font-semibold">
                {(['product', 'service'] as const).map((itType) => {
                  const activeType = (editing.itemType || 'product') === itType;
                  return (
                    <button
                      key={itType}
                      type="button"
                      onClick={() =>
                        setEditing({
                          ...editing,
                          itemType: itType,
                          category:
                            !editing.id && itType === 'service'
                              ? 'Services'
                              : !editing.id && editing.category === 'Services'
                                ? 'Main dishes'
                                : editing.category,
                        })
                      }
                      className={`rounded-md px-3 py-1 capitalize ${
                        activeType ? 'bg-emerald-800 text-white' : 'text-slate-600'
                      }`}
                    >
                      {itType}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="item-name-en" className="block font-semibold text-slate-700 mb-1">
                  Name (English)
                </label>
                <input
                  id="item-name-en"
                  required
                  placeholder="e.g. House Roast Beans or Catering"
                  value={editing.nameEn || ''}
                  onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label htmlFor="item-name-kh" className="block font-semibold text-slate-700 mb-1">
                  Name (Khmer)
                </label>
                <input
                  id="item-name-kh"
                  placeholder="ឈ្មោះជាភាសាខ្មែរ"
                  value={editing.nameKh || ''}
                  onChange={(e) => setEditing({ ...editing, nameKh: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label htmlFor="item-category" className="block font-semibold text-slate-700 mb-1">
                  Category
                </label>
                <input
                  id="item-category"
                  placeholder="Category"
                  value={editing.category || ''}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label htmlFor="item-price" className="block font-semibold text-slate-700 mb-1">
                  Price USD
                </label>
                <input
                  id="item-price"
                  type="number"
                  step="0.01"
                  placeholder="Price USD"
                  value={editing.priceUsd ?? 4.5}
                  onChange={(e) => setEditing({ ...editing, priceUsd: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="item-station" className="block font-semibold text-slate-700 mb-1">
                  Station
                </label>
                <select
                  id="item-station"
                  aria-label="Prep station"
                  value={editing.station || 'kitchen'}
                  onChange={(e) =>
                    setEditing({ ...editing, station: e.target.value as 'kitchen' | 'bar' })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="kitchen">Kitchen KDS</option>
                  <option value="bar">Bar / Counter</option>
                </select>
              </div>
            </div>

            {/* Product / Service Image Upload, URL & Presets */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5 text-emerald-800" />
                  Item Image (Product or Service Photo)
                </span>
                {editing.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, imageUrl: '' })}
                    className="text-red-600 font-semibold hover:underline"
                  >
                    Remove image
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {editing.imageUrl ? (
                  <img
                    src={editing.imageUrl}
                    alt={editing.nameEn || 'Item preview'}
                    referrerPolicy="no-referrer"
                    className="h-16 w-16 rounded-lg object-cover border border-slate-200 shrink-0 bg-white"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-lg border border-dashed border-slate-300 bg-white flex items-center justify-center text-slate-400 shrink-0">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                )}

                <div className="flex-1 space-y-2 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer">
                      <Upload className="h-3.5 w-3.5 text-emerald-800" />
                      <span>{imageLoading ? 'Compressing...' : 'Upload Image'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => void handleImageUpload(e)}
                        className="sr-only"
                      />
                    </label>
                    <span className="text-[11px] text-slate-500">Auto-optimized for cloud sync</span>
                  </div>
                  <input
                    type="text"
                    aria-label="Image URL"
                    value={editing.imageUrl || ''}
                    onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })}
                    placeholder="Or paste image URL (/src/assets/images/... or https://...)"
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px]"
                  />
                </div>
              </div>

              {imageError && <p className="text-[11px] text-red-600">{imageError}</p>}

              <div>
                <div className="text-[11px] text-slate-500 mb-1.5">Or pick a preset image:</div>
                <div className="grid grid-cols-7 gap-1.5">
                  {MENU_IMAGE_PRESETS.map((preset) => {
                    const selected = editing.imageUrl === preset.url;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        title={preset.label}
                        onClick={() => setEditing({ ...editing, imageUrl: preset.url })}
                        className={`rounded-lg overflow-hidden border transition-all ${
                          selected ? 'border-emerald-700 ring-2 ring-emerald-600' : 'border-slate-200'
                        }`}
                      >
                        <img
                          src={preset.url}
                          alt={preset.label}
                          referrerPolicy="no-referrer"
                          className="h-10 w-full object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-slate-300 px-3.5 py-2 font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white hover:bg-emerald-900"
              >
                Save Item
              </button>
            </div>
          </form>
        </div>
      )}

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-3 text-xs">
            <h3 className="text-base font-bold text-slate-900">Import menu from Excel / CSV</h3>
            <p className="text-slate-500">
              Paste lines in format <code>Dish name, Price USD, Category</code>:
            </p>
            <textarea
              rows={4}
              value={rawImportText}
              onChange={(e) => setRawImportText(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2.5 font-mono"
            />
            <div className="flex items-center justify-between">
              <button
                type="button"
                disabled={importLoading}
                onClick={() => void handleRunAiImport()}
                className="rounded-lg bg-slate-900 px-3.5 py-2 font-semibold text-white"
              >
                {importLoading ? 'Parsing...' : 'Parse Rows'}
              </button>
              {parsedPreview.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    importMenuItems(parsedPreview);
                    setImportOpen(false);
                    setParsedPreview([]);
                  }}
                  className="rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white"
                >
                  Import {parsedPreview.length} Dishes
                </button>
              )}
            </div>
            {parsedPreview.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-1 max-h-40 overflow-y-auto">
                {parsedPreview.map((p, i) => (
                  <div key={i} className="flex justify-between">
                    <span>
                      {p.nameEn} ({p.category})
                    </span>
                    <span className="font-semibold tabular-nums">${p.priceUsd.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function TablesAreasView() {
  const { state, activeBranch, saveTable, deleteTable, setExternalMode } = usePos();
  const [name, setName] = useState('');
  const [area, setArea] = useState<PosTable['area']>('Indoor');
  const [seats, setSeats] = useState('4');

  const tables = state.tables.filter((t) => t.branchId === activeBranch.id);

  const handleAddTable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    saveTable({ name: name.trim(), area, seats: Math.max(1, Number(seats) || 4) });
    setName('');
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Tables, areas &amp; QR codes</h1>
          <p className="text-xs text-slate-500">
            Print table QR tents for self-ordering and Counter QR for quick queues
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExternalMode('qr')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Preview Guest QR (/qr)
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-900"
          >
            <Printer className="h-3.5 w-3.5" /> Print All Table QRs
          </button>
        </div>
      </div>

      <form
        onSubmit={handleAddTable}
        className="no-print rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-end gap-3 text-xs"
      >
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Table Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. T09"
            className="rounded-lg border border-slate-300 px-3 py-1.5"
          />
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Area</label>
          <select
            aria-label="Table area"
            value={area}
            onChange={(e) => setArea(e.target.value as PosTable['area'])}
            className="rounded-lg border border-slate-300 px-3 py-1.5"
          >
            <option value="Indoor">Indoor</option>
            <option value="Garden">Garden</option>
            <option value="Bar counter">Bar counter</option>
            <option value="Take-away">Take-away</option>
          </select>
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Seats</label>
          <input
            type="number"
            min={1}
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
            className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 tabular-nums"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-800 px-4 py-1.5 font-semibold text-white"
        >
          <Plus className="h-3.5 w-3.5" /> Add Table
        </button>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 flex flex-col items-center text-center">
          <div className="text-xs font-bold text-emerald-950 mb-2">Counter Self-Order QR</div>
          <QrCodeBox value={`${window.location.origin}/?mode=qr&table=Counter`} size={112} />
          <div className="mt-2 text-[11px] text-emerald-800">Scan at counter to skip the line</div>
        </div>

        {tables.map((t) => (
          <div
            key={t.id}
            className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col items-center text-center"
          >
            <div className="w-full flex items-center justify-between mb-2">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-900">
                <Grid2x2 className="h-3.5 w-3.5 text-emerald-800" />
                {t.name}
              </span>
              <span className="text-[11px] text-slate-500">
                {t.area} · {t.seats} seats
              </span>
            </div>
            <QrCodeBox
              value={`${window.location.origin}/?mode=qr&table=${encodeURIComponent(t.name)}`}
              size={112}
            />
            <div className="no-print mt-2.5 w-full flex items-center justify-between text-[11px]">
              <span className="capitalize text-slate-500">{t.status}</span>
              <button
                type="button"
                onClick={() => deleteTable(t.id)}
                className="text-red-600 hover:underline inline-flex items-center gap-0.5"
              >
                <Trash2 className="h-3 w-3" /> Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StaffView() {
  const {
    state,
    tenants,
    tenantStates,
    activeTenantId,
    activeStaff,
    saveStaffMember,
    updateStaffPermissions,
    updateTenantOwnerPermissions,
    grantAllStaffInTenant,
    hasCurrentPermission,
    platformSettings,
    demoUsersCount,
    setDemoUsersDisabled,
    setTenantStatus,
  } = usePos();

  const isAdminActor = canManageOwnerGrants(activeStaff);
  const [managingTenantId, setManagingTenantId] = useState<string>(activeTenantId);
  const effectiveTenantId = isAdminActor && tenantStates[managingTenantId] ? managingTenantId : activeTenantId;
  const targetTenantState = tenantStates[effectiveTenantId] || state;
  const targetOwnerPermissions =
    targetTenantState.ownerPermissions ?? DEFAULT_OWNER_TENANT_PERMISSIONS;

  const [selectedStaffId, setSelectedStaffId] = useState<string>(
    () =>
      targetTenantState.staff.find((s) => s.role !== 'admin')?.id ||
      targetTenantState.staff[0]?.id ||
      ''
  );
  const selectedMember =
    targetTenantState.staff.find((s) => s.id === selectedStaffId) ||
    targetTenantState.staff.find((s) => s.role !== 'admin') ||
    targetTenantState.staff[0];

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<StaffRole>('cashier');
  const [pin, setPin] = useState('');
  const [feedback, setFeedback] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim() || !pin.trim()) return;
    if (!canAssignRole(activeStaff, role, state.ownerPermissions)) {
      setFeedback('Your role is not permitted to create that role tier.');
      return;
    }
    const defaultPerms =
      role === 'admin'
        ? [...ALL_PERMISSIONS]
        : role === 'owner'
          ? [...targetOwnerPermissions]
          : [...(DEFAULT_ROLE_PERMISSIONS[role] || [])];
    saveStaffMember(
      {
        name: name.trim(),
        username: username.trim().toLowerCase(),
        role,
        roleLabel: ROLE_LABELS[role],
        pin: pin.trim().slice(0, 4),
        active: true,
        permissions: defaultPerms,
      },
      effectiveTenantId
    );
    setFeedback(`Saved ${name.trim()} (${ROLE_LABELS[role]}) in ${targetTenantState.shopName}.`);
    setName('');
    setUsername('');
    setPin('');
  };

  const toggleUserPermission = (
    memberId: string,
    perm: PermissionKey,
    currentlyHas: boolean
  ) => {
    const member = targetTenantState.staff.find((s) => s.id === memberId);
    if (!member) return;
    const current = getEffectivePermissions(member, targetOwnerPermissions);
    const next = currentlyHas
      ? current.filter((p) => p !== perm)
      : [...current, perm];
    const ok = updateStaffPermissions(memberId, next, effectiveTenantId);
    if (ok) {
      setFeedback(
        `${currentlyHas ? 'Revoked' : 'Granted'} "${perm}" for ${member.name} (${targetTenantState.shopName}).`
      );
    } else {
      setFeedback('Permission change denied for your current role.');
    }
  };

  const toggleOwnerPermissionForTenant = (
    tenantId: string,
    perm: PermissionKey,
    currentlyHas: boolean
  ) => {
    const tnState = tenantStates[tenantId];
    if (!tnState) return;
    const current = tnState.ownerPermissions ?? DEFAULT_OWNER_TENANT_PERMISSIONS;
    const next = currentlyHas
      ? current.filter((p) => p !== perm)
      : [...current, perm];
    if (updateTenantOwnerPermissions(tenantId, next)) {
      setFeedback(
        `${currentlyHas ? 'Revoked' : 'Granted'} owner permission "${perm}" for ${tnState.shopName}.`
      );
    }
  };

  const selectedEffectivePerms = selectedMember
    ? getEffectivePermissions(selectedMember, targetOwnerPermissions)
    : [];

  const canCreateStaff =
    isAdminActor || hasCurrentPermission('staff');
  const canGrantAny =
    isAdminActor || hasCurrentPermission('permissions_grant');

  const permissionGroups: {
    id: 'operations' | 'catalog_stock' | 'finance' | 'admin_settings';
    title: string;
  }[] = [
    { id: 'operations', title: 'Operations & Cash Drawer' },
    { id: 'catalog_stock', title: 'Menu, Stock & Promotions' },
    { id: 'finance', title: 'Reports & VAT Compliance' },
    { id: 'admin_settings', title: 'Team, Tenants & Settings' },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-800" />
            Staff &amp; Permission Grants
          </h1>
          <p className="text-xs text-slate-500">
            Active actor: <strong>{activeStaff.name}</strong> ({activeStaff.roleLabel}) ·{' '}
            {isAdminActor
              ? 'Super Admin unrestricted access across all tenants, owners, users, and settings.'
              : canGrantAny
                ? 'Authorized to grant or revoke staff permissions within your tenant allowance.'
                : 'Read-only view (ask Owner or Admin to modify grants).'}
          </p>
        </div>

        {isAdminActor && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label htmlFor="admin-tenant-select" className="font-semibold text-slate-700">
              Managing Tenant:
            </label>
            <select
              id="admin-tenant-select"
              value={effectiveTenantId}
              onChange={(e) => {
                const nextId = e.target.value;
                setManagingTenantId(nextId);
                const nextState = tenantStates[nextId];
                const firstTarget =
                  nextState?.staff.find((s) => s.role !== 'admin') || nextState?.staff[0];
                if (firstTarget) setSelectedStaffId(firstTarget.id);
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-900"
            >
              {tenants.map((tn) => (
                <option key={tn.id} value={tn.id}>
                  {tn.name} ({tn.businessCode})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                if (grantAllStaffInTenant(effectiveTenantId)) {
                  setFeedback(
                    `Granted full tenant permissions to all users in ${targetTenantState.shopName}.`
                  );
                }
              }}
              className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-800"
            >
              Grant All Users Full Access
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-950"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
            {feedback}
          </span>
          <button
            type="button"
            onClick={() => setFeedback('')}
            className="text-emerald-800 underline text-[11px]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Admin-Only Global Demo Control & Tenant Owner Permissions Table */}
      {isAdminActor && (
        <div className="space-y-4">
          <div
            className={`rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3 ${
              platformSettings.demoUsersDisabled
                ? 'border-amber-300 bg-amber-50/70'
                : 'border-slate-300 bg-white'
            }`}
          >
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <Ban
                  className={`h-4 w-4 ${
                    platformSettings.demoUsersDisabled ? 'text-amber-700' : 'text-slate-700'
                  }`}
                />
                <h2 className="text-sm font-bold text-slate-900">
                  Platform Demo Users &amp; Sample Shops Control
                </h2>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    platformSettings.demoUsersDisabled
                      ? 'bg-amber-200 text-amber-950'
                      : 'bg-emerald-100 text-emerald-900'
                  }`}
                >
                  {platformSettings.demoUsersDisabled ? 'Demo Disabled' : 'Demo Enabled'}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                {platformSettings.demoUsersDisabled
                  ? `All ${demoUsersCount} demo user accounts and 24-hour sample shops are disabled. Super Admin (0000) and real registered tenants remain active.`
                  : `${demoUsersCount} demo staff accounts across sample shops are currently enabled. Disable them anytime to enforce real tenant authentication only.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextDisabled = !platformSettings.demoUsersDisabled;
                if (setDemoUsersDisabled(nextDisabled)) {
                  setFeedback(
                    nextDisabled
                      ? 'All demo users and sample shops have been disabled platform-wide. Super Admin & real tenants remain active.'
                      : 'Demo users and sample shops have been re-enabled platform-wide.'
                  );
                }
              }}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                platformSettings.demoUsersDisabled
                  ? 'bg-emerald-800 text-white hover:bg-emerald-900'
                  : 'bg-amber-700 text-white hover:bg-amber-800'
              }`}
            >
              {platformSettings.demoUsersDisabled
                ? 'Enable Demo Users'
                : 'Disable All Demo Users'}
            </button>
          </div>

          <div className="rounded-xl border border-slate-300 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-emerald-800" />
                  Admin Global Control · Owner Permissions Across All Tenants ({tenants.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Manage tenant status and grant or restrict what each Tenant Owner can access (Settings, Staff Grants, Reports, Stock, Billing). Only Super Admin can alter Owner permissions.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Tenant Workspace</th>
                    <th className="py-2 pr-3 font-semibold">Owner</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 pr-3 font-semibold">Granted</th>
                    <th className="py-2 pr-3 font-semibold">Key Capabilities</th>
                    <th className="py-2 font-semibold text-right">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tenants.map((tn) => {
                    const ownerPerms = tn.ownerPermissions ?? DEFAULT_OWNER_TENANT_PERMISSIONS;
                    const isSuspended = tn.tenantStatus === 'suspended';
                    const keyToggles: { key: PermissionKey; label: string }[] = [
                      { key: 'settings', label: 'Settings' },
                      { key: 'permissions_grant', label: 'Grant Staff' },
                      { key: 'staff', label: 'Staff' },
                      { key: 'reports', label: 'Reports' },
                      { key: 'stock', label: 'Stock' },
                      { key: 'chain', label: 'Chain' },
                      { key: 'plan_billing', label: 'Billing' },
                    ];
                    return (
                      <tr key={tn.id} className={tn.id === effectiveTenantId ? 'bg-emerald-50/40' : ''}>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                            <span>{tn.name}</span>
                            {tn.isDemoTenant && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-900">
                                DEMO
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[10px] text-slate-500">{tn.businessCode}</div>
                        </td>
                        <td className="py-2.5 pr-3 text-slate-700">{tn.ownerName}</td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                              isSuspended
                                ? 'bg-red-100 text-red-800'
                                : 'bg-emerald-100 text-emerald-900'
                            }`}
                          >
                            {isSuspended ? 'Suspended' : 'Active'}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 tabular-nums font-semibold text-emerald-900">
                          {ownerPerms.length} / {OWNER_GRANTABLE_PERMISSIONS.length}
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex flex-wrap gap-1.5">
                            {keyToggles.map((kt) => {
                              const hasIt = ownerPerms.includes(kt.key);
                              return (
                                <label
                                  key={kt.key}
                                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium cursor-pointer select-none ${
                                    hasIt
                                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                      : 'border-slate-200 bg-slate-50 text-slate-500'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={hasIt}
                                    onChange={() =>
                                      toggleOwnerPermissionForTenant(tn.id, kt.key, hasIt)
                                    }
                                    className="h-3 w-3 accent-emerald-800"
                                  />
                                  <span>{kt.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </td>
                        <td className="py-2.5 text-right whitespace-nowrap space-x-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const nextStatus = isSuspended ? 'active' : 'suspended';
                              if (setTenantStatus(tn.id, nextStatus)) {
                                setFeedback(
                                  `${nextStatus === 'suspended' ? 'Suspended' : 'Activated'} tenant ${tn.name}.`
                                );
                              }
                            }}
                            className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                              isSuspended
                                ? 'border-emerald-700 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                                : 'border-red-200 bg-white text-red-700 hover:bg-red-50'
                            }`}
                          >
                            {isSuspended ? 'Activate' : 'Suspend'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                updateTenantOwnerPermissions(tn.id, [
                                  ...DEFAULT_OWNER_TENANT_PERMISSIONS,
                                ])
                              ) {
                                setFeedback(`Granted all owner permissions for ${tn.name}.`);
                              }
                            }}
                            className="rounded border border-emerald-700 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100"
                          >
                            Full Owner
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setManagingTenantId(tn.id);
                              const ownerUsr =
                                tenantStates[tn.id]?.staff.find((s) => s.role === 'owner') ||
                                tenantStates[tn.id]?.staff[0];
                              if (ownerUsr) setSelectedStaffId(ownerUsr.id);
                            }}
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Inspect Matrix
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Team Accounts + Add Staff Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-800" />
              Users in {targetTenantState.shopName} ({targetTenantState.staff.length})
            </h2>
            {canGrantAny && !isAdminActor && (
              <button
                type="button"
                onClick={() => {
                  if (grantAllStaffInTenant(effectiveTenantId)) {
                    setFeedback(`Granted maximum tenant permissions to staff in ${targetTenantState.shopName}.`);
                  }
                }}
                className="rounded-lg border border-emerald-700 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100"
              >
                Grant Max to Staff
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Name</th>
                  <th className="py-2 pr-3 font-semibold">Username</th>
                  <th className="py-2 pr-3 font-semibold">Role</th>
                  <th className="py-2 pr-3 font-semibold">PIN</th>
                  <th className="py-2 pr-3 font-semibold">Grants</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 font-semibold text-right">Permissions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {targetTenantState.staff.map((s) => {
                  const eff = getEffectivePermissions(s, targetOwnerPermissions);
                  const isSelected = selectedMember?.id === s.id;
                  const isDemoAcct = isDemoStaffAccount(s, targetTenantState);
                  const demoBlocked = isDemoAcct && platformSettings.demoUsersDisabled;
                  const canToggleActive =
                    canCreateStaff &&
                    s.role !== 'admin' &&
                    (isAdminActor || s.role !== 'owner');
                  return (
                    <tr
                      key={s.id}
                      className={isSelected ? 'bg-emerald-50/60' : 'hover:bg-slate-50'}
                    >
                      <td className="py-2.5 pr-3 font-semibold text-slate-900">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{s.name}</span>
                          {isDemoAcct && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-900">
                              DEMO
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 font-mono">{s.username}</td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            s.role === 'admin'
                              ? 'bg-slate-900 text-white'
                              : s.role === 'owner'
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {s.roleLabel}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 font-mono">{s.pin}</td>
                      <td className="py-2.5 pr-3 tabular-nums font-medium text-slate-700">
                        {eff.length}/{ALL_PERMISSIONS.length}
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            disabled={!canToggleActive}
                            onClick={() =>
                              saveStaffMember({ ...s, active: !s.active }, effectiveTenantId)
                            }
                            className={`rounded px-2 py-0.5 text-[11px] font-semibold disabled:opacity-60 ${
                              s.active && !demoBlocked
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {demoBlocked ? 'Demo Disabled' : s.active ? 'Active' : 'Disabled'}
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedStaffId(s.id)}
                          className={`rounded px-2.5 py-1 text-[11px] font-semibold ${
                            isSelected
                              ? 'bg-emerald-800 text-white'
                              : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {isSelected ? 'Editing' : 'Configure'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <form
          onSubmit={handleAdd}
          className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 text-xs"
        >
          <h2 className="text-sm font-bold text-slate-900">
            Add user to {targetTenantState.shopName}
          </h2>
          {!canCreateStaff ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              You need <strong>Staff Directory</strong> permission to add team members.
            </div>
          ) : (
            <>
              <input
                required
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <input
                required
                placeholder="Username (e.g. guide_cashier2)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
              />
              <select
                aria-label="Staff role"
                value={role}
                onChange={(e) => setRole(e.target.value as StaffRole)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="cashier">Cashier</option>
                <option value="waiter">Waiter</option>
                <option value="kitchen">Kitchen / Bar</option>
                <option value="manager">Store Manager</option>
                <option value="runner">Runner</option>
                {isAdminActor && <option value="owner">Business Owner (Admin Only)</option>}
                {isAdminActor && <option value="admin">Super Admin (Admin Only)</option>}
              </select>
              <input
                required
                maxLength={4}
                placeholder="4-digit PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-emerald-800 py-2 font-semibold text-white hover:bg-emerald-900"
              >
                Save User
              </button>
            </>
          )}
        </form>
      </div>

      {/* Granular Permission Matrix for Selected User */}
      {selectedMember && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                Permission Matrix — {selectedMember.name} ({selectedMember.roleLabel})
                {selectedMember.role === 'admin' && (
                  <span className="rounded bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                    Immutable Super Admin
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500">
                {selectedMember.role === 'admin'
                  ? 'Super Admin always holds full permissions across all modules, users, tenants, and settings.'
                  : selectedMember.role === 'owner' && !isAdminActor
                    ? 'Only a Super Admin can grant or revoke permissions for a Business Owner.'
                    : `Toggle module & action grants for ${selectedMember.name} in ${targetTenantState.shopName}.`}
              </p>
            </div>

            {selectedMember.role !== 'admin' &&
              (isAdminActor ||
                (selectedMember.role !== 'owner' && canGrantAny)) && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      const pool = isAdminActor
                        ? [...OWNER_GRANTABLE_PERMISSIONS]
                        : getEffectivePermissions(activeStaff, state.ownerPermissions).filter(
                            (p) => p !== 'full_admin'
                          );
                      if (updateStaffPermissions(selectedMember.id, pool, effectiveTenantId)) {
                        setFeedback(`Granted maximum allowed permissions to ${selectedMember.name}.`);
                      }
                    }}
                    className="rounded-lg bg-emerald-800 px-3 py-1.5 font-semibold text-white hover:bg-emerald-900"
                  >
                    Grant Max Allowed
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const defaults = [...(DEFAULT_ROLE_PERMISSIONS[selectedMember.role] || [])];
                      if (updateStaffPermissions(selectedMember.id, defaults, effectiveTenantId)) {
                        setFeedback(`Reset ${selectedMember.name} to ${selectedMember.roleLabel} defaults.`);
                      }
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Reset Role Defaults
                  </button>
                </div>
              )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {permissionGroups.map((grp) => {
              const items = PERMISSION_DEFINITIONS.filter((d) => d.group === grp.id);
              return (
                <div key={grp.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    {grp.title}
                  </h3>
                  <div className="space-y-1.5">
                    {items.map((perm) => {
                      const checked = selectedEffectivePerms.includes(perm.key);
                      const allowedToEdit = canGrantPermission(
                        activeStaff,
                        selectedMember,
                        perm.key,
                        state.ownerPermissions
                      );
                      return (
                        <label
                          key={perm.key}
                          className={`flex items-start justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                            checked
                              ? 'border-emerald-200 bg-white'
                              : 'border-slate-200 bg-white/60 text-slate-500'
                          } ${allowedToEdit ? 'cursor-pointer hover:border-emerald-400' : 'opacity-75 cursor-not-allowed'}`}
                        >
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!allowedToEdit}
                              onChange={() =>
                                toggleUserPermission(selectedMember.id, perm.key, checked)
                              }
                              className="mt-0.5 h-3.5 w-3.5 accent-emerald-800"
                            />
                            <div>
                              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                <span>{perm.label}</span>
                                {!allowedToEdit && (
                                  <Lock className="h-3 w-3 text-slate-400" aria-label="Locked" />
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500">{perm.description}</div>
                            </div>
                          </div>
                          <span className="font-mono text-[10px] text-slate-400 shrink-0">
                            {perm.key}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function BillsView() {
  const { state, activeBranch, setReceiptOrder, setActiveOrderId, setSelectedTableId, setNavSection } =
    usePos();
  const [filter, setFilter] = useState<'all' | 'paid' | 'open'>('all');

  const orders = state.orders.filter((o) => {
    if (o.branchId !== activeBranch.id) return false;
    if (filter === 'paid') return o.status === 'paid';
    if (filter === 'open') return o.status !== 'paid' && o.status !== 'voided';
    return true;
  });

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Bills &amp; orders</h1>
          <p className="text-xs text-slate-500">All open, kitchen-active, and settled bills</p>
        </div>
        <div className="flex gap-1.5 text-xs">
          {(['all', 'open', 'paid'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 font-semibold capitalize ${
                filter === f
                  ? 'bg-emerald-800 text-white'
                  : 'border border-slate-200 bg-white text-slate-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-3 font-semibold">Bill #</th>
                <th className="py-2 pr-3 font-semibold">Table / Channel</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold">Payment</th>
                <th className="py-2 pr-3 font-semibold text-right">USD</th>
                <th className="py-2 pr-3 font-semibold text-right">KHR</th>
                <th className="py-2 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="py-2.5 pr-3 font-mono font-semibold">
                    <span className="inline-flex items-center gap-1">
                      <Receipt className="h-3.5 w-3.5 text-slate-400" />#{o.orderNumber}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">{o.tableName}</td>
                  <td className="py-2.5 pr-3 capitalize">{o.status}</td>
                  <td className="py-2.5 pr-3">{o.paymentMethod || 'Unpaid'}</td>
                  <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">
                    ${o.totalUsd.toFixed(2)}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-slate-500 tabular-nums">
                    {o.totalKhr.toLocaleString()} ៛
                  </td>
                  <td className="py-2.5 text-right">
                    {o.status === 'paid' ? (
                      <button
                        type="button"
                        onClick={() => setReceiptOrder(o)}
                        className="text-emerald-800 font-semibold hover:underline"
                      >
                        Receipt
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTableId(o.tableId || null);
                          setActiveOrderId(o.id);
                          setNavSection('sell');
                        }}
                        className="text-amber-700 font-semibold hover:underline"
                      >
                        Open in Sell
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function ChainView() {
  const {
    state,
    tenants,
    tenantStates,
    activeTenantId,
    activeStaff,
    switchTenant,
    activeBranch,
    switchBranch,
    addBranch,
    setNavSection,
    updateTenantOwnerPermissions,
    platformSettings,
    demoUsersCount,
    setDemoUsersDisabled,
    setTenantStatus,
    deleteTenantWorkspace,
  } = usePos();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [chainFeedback, setChainFeedback] = useState('');
  const isAdminActor = canManageOwnerGrants(activeStaff);
  const visibleTenants = isAdminActor
    ? tenants
    : tenants.filter((tn) => tn.id === activeTenantId);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    addBranch(name.trim(), code.trim());
    setName('');
    setCode('');
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Tenant Workspaces (Multi-Tenant for Admin, Own Isolated Workspace for Tenant Actors) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {isAdminActor
                ? 'Admin Multi-Tenant Control & Branches'
                : 'My Tenant Workspace & Branches'}
            </h1>
            <p className="text-xs text-slate-500">
              {isAdminActor
                ? 'Manage all business tenants, disable or enable demo user access, suspend or remove workspaces, and switch active tenant.'
                : `Isolated workspace data for ${state.shopName} (${state.businessCode}). Only your own tenant branches and data are accessible here.`}
            </p>
          </div>
          {isAdminActor && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const nextDisabled = !platformSettings.demoUsersDisabled;
                  if (setDemoUsersDisabled(nextDisabled)) {
                    setChainFeedback(
                      nextDisabled
                        ? `Disabled all ${demoUsersCount} demo user accounts & sample shops platform-wide.`
                        : 'Re-enabled demo user accounts & sample shops platform-wide.'
                    );
                  }
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${
                  platformSettings.demoUsersDisabled
                    ? 'border border-emerald-700 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                    : 'border border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100'
                }`}
              >
                <Ban className="h-3.5 w-3.5" />
                {platformSettings.demoUsersDisabled
                  ? 'Enable Demo Users'
                  : `Disable All Demo Users (${demoUsersCount})`}
              </button>
              <button
                type="button"
                onClick={() => setRegisterOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-900"
              >
                <Plus className="h-3.5 w-3.5" /> Register New Tenant
              </button>
            </div>
          )}
        </div>

        {chainFeedback && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-950">
            <span>{chainFeedback}</span>
            <button
              type="button"
              onClick={() => setChainFeedback('')}
              className="text-emerald-800 underline text-[11px]"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleTenants.map((tn) => {
            const isCurrent = tn.id === activeTenantId;
            const isSuspended = tn.tenantStatus === 'suspended';
            const ownerPerms = tn.ownerPermissions ?? DEFAULT_OWNER_TENANT_PERMISSIONS;
            const ownerHasSettings = ownerPerms.includes('settings');
            const tnBranch = isCurrent
              ? activeBranch
              : tenantStates[tn.id]?.branches[0];
            const tnTpl = normalizeInvoiceTemplate(tnBranch?.invoiceTemplate, {
              shopName: tn.name,
              branchCode: tn.branchCode,
              businessType: tn.businessType,
            });
            return (
              <div
                key={tn.id}
                className={`rounded-xl border bg-white p-4 space-y-2 ${
                  isCurrent ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900 truncate">
                    <CompanyLogoBadge
                      logoImageUrl={tnTpl.logoImageUrl}
                      logoIcon={tnTpl.logoIcon}
                      logoText={tnTpl.logoText}
                      alt={`${tn.name} logo`}
                      className="h-6 w-6 rounded-md text-[10px]"
                      iconClassName="h-3.5 w-3.5"
                      bgClassName="bg-emerald-800"
                      textClassName="text-white"
                    />
                    <span className="truncate">{tn.name}</span>
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {tn.isDemoTenant && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-900">
                        DEMO
                      </span>
                    )}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        isSuspended
                          ? 'bg-red-100 text-red-800'
                          : 'bg-emerald-100 text-emerald-900'
                      }`}
                    >
                      {isSuspended ? 'Suspended' : 'Active'}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-slate-600 capitalize flex items-center justify-between gap-2">
                  <span>
                    {tn.businessType} ·{' '}
                    {tn.khqrAccountId ? (
                      <>
                        KHQR <span className="font-mono text-slate-800">{tn.khqrAccountId}</span>
                      </>
                    ) : (
                      <span className="text-slate-500">KHQR optional (not set)</span>
                    )}
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-slate-500">
                    {tn.businessCode}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 flex items-center justify-between">
                  <span>
                    Owner Grants: <strong className="text-slate-800">{ownerPerms.length}/{OWNER_GRANTABLE_PERMISSIONS.length}</strong>
                  </span>
                  <span className={ownerHasSettings ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                    Settings: {ownerHasSettings ? 'Allowed' : 'Restricted'}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500 truncate">Owner: {tn.ownerName}</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isAdminActor && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const next: PermissionKey[] = ownerHasSettings
                              ? ownerPerms.filter((p) => p !== 'settings')
                              : [...ownerPerms, 'settings'];
                            updateTenantOwnerPermissions(tn.id, next);
                          }}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {ownerHasSettings ? 'Lock Settings' : 'Allow Settings'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            switchTenant(tn.id);
                            setNavSection('staff');
                          }}
                          className="rounded-lg border border-emerald-700 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100"
                        >
                          Grants
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const nextStatus = isSuspended ? 'active' : 'suspended';
                            if (setTenantStatus(tn.id, nextStatus)) {
                              setChainFeedback(
                                `${nextStatus === 'suspended' ? 'Suspended' : 'Activated'} tenant "${tn.name}".`
                              );
                            }
                          }}
                          className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                            isSuspended
                              ? 'border-emerald-700 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                              : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-50'
                          }`}
                        >
                          {isSuspended ? 'Activate' : 'Suspend'}
                        </button>
                        {!isCurrent && tenants.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              if (deleteTenantWorkspace(tn.id)) {
                                setChainFeedback(`Removed tenant "${tn.name}".`);
                              }
                            }}
                            title="Delete inactive tenant workspace"
                            className="rounded-lg border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => switchTenant(tn.id)}
                          className={`rounded-lg px-3 py-1 font-semibold ${
                            isCurrent
                              ? 'bg-slate-900 text-white'
                              : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {isCurrent ? 'Active Tenant' : 'Switch Tenant'}
                        </button>
                      </>
                    )}
                    {!isAdminActor && (
                      <span className="rounded-lg bg-slate-900 px-3 py-1 font-semibold text-white">
                        Own Workspace
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Branches in Active Tenant */}
      <div className="space-y-3 pt-2 border-t border-slate-200">
        <h2 className="text-sm font-bold text-slate-900">Branches in {state.shopName}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {state.branches.map((b) => {
            const branchOrders = state.orders.filter(
              (o) => o.branchId === b.id && o.status === 'paid'
            );
            const rev = branchOrders.reduce((s, o) => s + o.totalUsd, 0);
            const isCurrent = b.id === activeBranch.id;
            return (
              <div
                key={b.id}
                className={`rounded-xl border bg-white p-4 space-y-2 ${
                  isCurrent ? 'border-emerald-700 ring-1 ring-emerald-700' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
                    <Building2 className="h-4 w-4 text-emerald-800" />
                    {b.name}
                  </span>
                  <span className="font-mono text-xs font-semibold text-slate-500">{b.code}</span>
                </div>
                <p className="text-xs text-slate-500">{b.address}</p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="tabular-nums font-bold text-slate-900">
                    ${rev.toFixed(2)} ({branchOrders.length} bills)
                  </span>
                  <button
                    type="button"
                    onClick={() => switchBranch(b.id)}
                    className={`rounded-lg px-3 py-1 font-semibold ${
                      isCurrent
                        ? 'bg-emerald-800 text-white'
                        : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {isCurrent ? 'Active' : 'Switch'}
                  </button>
                </div>
              </div>
            );
          })}

          <form
            onSubmit={handleAdd}
            className="rounded-xl border border-dashed border-slate-300 bg-white p-4 space-y-2.5 text-xs"
          >
            <h3 className="text-sm font-bold text-slate-900">Add new branch</h3>
            <input
              required
              placeholder="Branch name (e.g. Lotus Toul Kork)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            <input
              required
              placeholder="Code (e.g. TK3)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono uppercase"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-800 py-2 font-semibold text-white"
            >
              Create Branch
            </button>
          </form>
        </div>
      </div>

      <TenantRegistrationModal open={registerOpen} onClose={() => setRegisterOpen(false)} />
    </div>
  );
}

export function AuditLogView() {
  const { state, activeBranch } = usePos();
  const [sev, setSev] = useState<'all' | 'info' | 'warning' | 'alert'>('all');

  const logs = state.auditLogs.filter(
    (l) => l.branchId === activeBranch.id && (sev === 'all' || l.severity === sev)
  );

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Audit log</h1>
          <p className="text-xs text-slate-500">
            Voided items, manager PIN overrides, shift variances, and credit notes
          </p>
        </div>
        <div className="flex gap-1.5 text-xs">
          {(['all', 'info', 'warning', 'alert'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSev(s)}
              className={`rounded-lg px-3 py-1.5 font-semibold capitalize ${
                sev === s
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="space-y-2">
          {logs.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No audit entries matching filter.</p>
          ) : (
            logs.map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2.5 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <History className="h-4 w-4 text-slate-400 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-900">{l.action}</span>{' '}
                    <span className="text-slate-600">— {l.detail}</span>
                    <div className="text-[11px] text-slate-400">
                      Actor: {l.actorName} · {new Date(l.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${
                    l.severity === 'alert'
                      ? 'bg-red-100 text-red-800'
                      : l.severity === 'warning'
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {l.severity}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function PlanBillingView() {
  const { state, activeBranch, activateTenantSubscription } = usePos();
  const [checkoutPlan, setCheckoutPlan] = useState<SubscriptionPlan | null>(null);
  const [checkoutPeriods, setCheckoutPeriods] = useState<number>(1);
  const [lastActivatedBanner, setLastActivatedBanner] = useState<string>('');

  const subStatus = state.subscriptionStatus ?? (state.planDaysLeft > 0 ? 'active' : 'pending');

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Plan &amp; billing</h1>
          <p className="text-xs text-slate-500 tabular-nums">
            Current plan: <strong className="uppercase text-slate-800">{state.plan}</strong> · Status:{' '}
            <strong
              className={
                subStatus === 'active' ? 'text-emerald-700 uppercase' : 'text-amber-700 uppercase'
              }
            >
              {subStatus}
            </strong>{' '}
            · <strong>{state.planDaysLeft}</strong> day(s) remaining · Referral code:{' '}
            <span className="font-mono font-semibold">{state.referralCode}</span>
            {state.subscriptionRef ? (
              <>
                {' '}
                · Last Bakong Ref:{' '}
                <span className="font-mono font-semibold">{state.subscriptionRef}</span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {lastActivatedBanner && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-950 font-medium"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
          <span>{lastActivatedBanner}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SUBSCRIPTION_PLAN_LIST.map((planDef) => {
          const isCurrent = state.plan === planDef.id;
          const isSelectedForCheckout = checkoutPlan === planDef.id;
          return (
            <div
              key={planDef.id}
              className={`rounded-xl border bg-white p-5 flex flex-col justify-between space-y-4 ${
                isCurrent
                  ? 'border-emerald-700 ring-1 ring-emerald-700'
                  : isSelectedForCheckout
                    ? 'border-slate-900 ring-1 ring-slate-900'
                    : 'border-slate-200'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                    {planDef.id === 'daily' && (
                      <CalendarClock className="h-4 w-4 text-emerald-700" />
                    )}
                    {planDef.id === 'premium' && <Star className="h-4 w-4 text-amber-500" />}
                    {planDef.name}
                  </h2>
                  <span className="text-lg font-bold text-emerald-800 tabular-nums">
                    {planDef.billingLabel}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">{planDef.tagline}</p>
                <ul className="space-y-1.5 text-xs text-slate-600">
                  {planDef.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-1.5">
                      <Check className="h-3.5 w-3.5 text-emerald-700 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCheckoutPlan(planDef.id);
                  setCheckoutPeriods(1);
                  setLastActivatedBanner('');
                }}
                className={`w-full rounded-lg py-2 text-xs font-semibold transition-colors ${
                  isCurrent || planDef.id === 'daily'
                    ? 'bg-emerald-800 text-white hover:bg-emerald-900'
                    : 'border border-slate-300 text-slate-800 hover:bg-slate-50'
                }`}
              >
                {planDef.id === 'daily'
                  ? isCurrent
                    ? 'Add Daily Pass ($1/day) via KHQR'
                    : 'Switch to Daily ($1/day) via KHQR'
                  : isCurrent
                    ? `Renew ${planDef.name} via KHQR ($${planDef.priceUsd})`
                    : `Select ${planDef.name} via KHQR ($${planDef.priceUsd})`}
              </button>
            </div>
          );
        })}
      </div>

      {checkoutPlan && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              Pay Subscription via Bakong KHQR
            </h2>
            <button
              type="button"
              onClick={() => setCheckoutPlan(null)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel Checkout
            </button>
          </div>
          <SubscriptionKhqrCard
            plan={checkoutPlan}
            periods={checkoutPeriods}
            onPeriodsChange={setCheckoutPeriods}
            businessCode={state.businessCode}
            businessName={state.shopName}
            exchangeRate={activeBranch.exchangeRate}
            initialCurrency={activeBranch.khqrDefaultCurrency || 'USD'}
            confirmLabel="Confirm Paid (Sandbox) & Activate Days"
            onPaymentConfirmed={(res) => {
              activateTenantSubscription(res);
              setLastActivatedBanner(
                `Activated ${res.plan.toUpperCase()} (+${res.days} day${res.days > 1 ? 's' : ''}, $${res.amountUsd.toFixed(2)}) via Bakong KHQR · Ref ${res.paymentRef}`
              );
              setCheckoutPlan(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

export function SettingsView() {
  const {
    state,
    tenants,
    tenantStates,
    activeTenantId,
    activeBranch,
    activeStaff,
    updateBranchSettings,
    updateBranchSettingsForTenant,
    resetDemoData,
    platformSettings,
  } = usePos();
  const isAdminActor = canManageOwnerGrants(activeStaff);
  const canEdit = canEditSettings(activeStaff, state.ownerPermissions);
  const [targetTenantId, setTargetTenantId] = useState<string>(activeTenantId);
  const [verifyingKhqr, setVerifyingKhqr] = useState(false);
  const [khqrVerifyStatus, setKhqrVerifyStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [templateSavedBanner, setTemplateSavedBanner] = useState<string>('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState('');

  useEffect(() => {
    setTargetTenantId(activeTenantId);
    setLogoError('');
  }, [activeTenantId]);

  const effectiveTenantId =
    isAdminActor && tenantStates[targetTenantId] ? targetTenantId : activeTenantId;
  const effectiveTenantState = tenantStates[effectiveTenantId] || state;
  const effectiveBranch =
    effectiveTenantId === activeTenantId
      ? activeBranch
      : effectiveTenantState.branches[0] || activeBranch;

  const effectiveTemplate = useMemo(
    () =>
      normalizeInvoiceTemplate(effectiveBranch.invoiceTemplate, {
        shopName: effectiveBranch.name || effectiveTenantState.shopName,
        branchCode: effectiveBranch.code,
        businessType: effectiveTenantState.businessType,
      }),
    [
      effectiveBranch.invoiceTemplate,
      effectiveBranch.name,
      effectiveBranch.code,
      effectiveTenantState.shopName,
      effectiveTenantState.businessType,
    ]
  );

  const samplePreviewOrder = useMemo<PosOrder>(() => {
    const existingPaid = effectiveTenantState.orders.find(
      (o) => o.branchId === effectiveBranch.id && o.status === 'paid'
    );
    if (existingPaid) return existingPaid;
    return {
      id: 'preview_order',
      branchId: effectiveBranch.id,
      orderNumber: Math.max(101, effectiveTenantState.nextOrderNumber || 101),
      tableName: 'T05 · Dine-in',
      channel: 'dine_in',
      status: 'paid',
      guests: 2,
      items: [
        {
          id: 'prev_1',
          menuItemId: 'sample_1',
          nameEn: 'Signature Iced Latte',
          nameKh: 'កាហ្វេទឹកកក',
          nameVi: 'Cà phê sữa đá',
          category: 'Coffee',
          station: 'bar',
          unitPriceUsd: 3.5,
          qty: 2,
          round: 1,
          sentToKitchen: true,
          kdsStatus: 'served',
        },
        {
          id: 'prev_2',
          menuItemId: 'sample_2',
          nameEn: 'Beef Lok Lak Rice',
          nameKh: 'បាយឡុកឡាក់សាច់គោ',
          nameVi: 'Cơm bò lúc lắc',
          category: 'Main dishes',
          station: 'kitchen',
          unitPriceUsd: 6.5,
          qty: 1,
          note: 'Medium rare',
          round: 1,
          sentToKitchen: true,
          kdsStatus: 'served',
        },
      ],
      currentRound: 1,
      manualDiscountPercent: 0,
      manualDiscountUsd: 0,
      promoDiscountUsd: 0,
      pointsRedeemed: 0,
      depositAppliedUsd: 0,
      totalUsd: 14.85,
      totalKhr: 60900,
      paidUsd: 20,
      paidKhr: 0,
      changeUsd: 5,
      changeKhr: 600,
      paymentMethod: 'KHQR',
      cashierName: activeStaff.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }, [effectiveTenantState.orders, effectiveTenantState.nextOrderNumber, effectiveBranch.id, activeStaff.name]);

  if (!canEdit) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <div className="rounded-2xl border border-amber-200 bg-white p-6 space-y-3">
          <div className="flex items-center gap-2.5 text-amber-800">
            <Lock className="h-5 w-5" />
            <h1 className="text-base font-bold text-slate-900">Settings Access Restricted</h1>
          </div>
          <p className="text-xs text-slate-600">
            Your account ({activeStaff.name} · {activeStaff.roleLabel}) does not currently hold the{' '}
            <span className="font-mono font-semibold">settings</span> permission in{' '}
            <strong>{state.shopName}</strong>. Only Super Admin can grant or restore Settings permission for a Tenant Owner or Staff member.
          </p>
        </div>
      </div>
    );
  }

  const updateField = <K extends keyof BranchConfig>(key: K, value: BranchConfig[K]) => {
    if (isAdminActor && effectiveTenantId !== activeTenantId) {
      updateBranchSettingsForTenant(effectiveTenantId, effectiveBranch.id, { [key]: value });
    } else {
      updateBranchSettings({ [key]: value });
    }
  };

  const applyBranchPartial = (partial: Partial<BranchConfig>) => {
    if (isAdminActor && effectiveTenantId !== activeTenantId) {
      updateBranchSettingsForTenant(effectiveTenantId, effectiveBranch.id, partial);
    } else {
      updateBranchSettings(partial);
    }
  };

  const updateTemplateField = <K extends keyof InvoiceTemplateConfig>(
    key: K,
    value: InvoiceTemplateConfig[K]
  ) => {
    applyBranchPartial({
      invoiceTemplate: {
        ...effectiveTemplate,
        [key]: value,
      },
    });
    setTemplateSavedBanner(`Updated invoice template for ${effectiveTenantState.shopName}`);
  };

  const updateTemplatePartial = (partial: Partial<InvoiceTemplateConfig>, banner?: string) => {
    applyBranchPartial({
      invoiceTemplate: {
        ...effectiveTemplate,
        ...partial,
      },
    });
    setTemplateSavedBanner(banner || `Updated invoice template for ${effectiveTenantState.shopName}`);
  };

  const handleCompanyLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoError('');
    setLogoUploading(true);
    try {
      const compressed = await compressImageFileToDataUrl(file, 36000, 180);
      updateTemplatePartial(
        { logoImageUrl: compressed, showLogoBadge: true },
        `Uploaded company logo for ${effectiveTenantState.shopName}`
      );
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Unable to process company logo image.');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleResetTemplate = () => {
    const freshTpl = createDefaultInvoiceTemplate({
      shopName: effectiveBranch.name || effectiveTenantState.shopName,
      branchCode: effectiveBranch.code,
      businessType: effectiveTenantState.businessType,
    });
    applyBranchPartial({ invoiceTemplate: freshTpl });
    setLogoError('');
    setTemplateSavedBanner(`Reset invoice template to ${effectiveTenantState.shopName} defaults`);
  };

  const handleVerifyBakong = async () => {
    const cleanId = (effectiveBranch.khqrBakongId || '').trim();
    if (!cleanId) {
      updateField('bakongConnected', false);
      setKhqrVerifyStatus({
        ok: true,
        msg: 'Bakong KHQR is optional — enter an Account ID like myshop@abaa whenever you want to accept store KHQR payments.',
      });
      return;
    }
    setVerifyingKhqr(true);
    setKhqrVerifyStatus(null);
    try {
      const res = await fetch('/api/bakong/verify-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: cleanId }),
      });
      const data = (await res.json()) as { valid?: boolean; message?: string; error?: string };
      const ok = Boolean(data.valid);
      updateField('bakongConnected', ok);
      setKhqrVerifyStatus({
        ok,
        msg: data.message || data.error || 'Verification complete.',
      });
    } catch {
      setKhqrVerifyStatus({ ok: false, msg: 'Unable to reach Bakong verification endpoint.' });
    } finally {
      setVerifyingKhqr(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-emerald-800" />
            Branch settings — {effectiveBranch.name}
          </h1>
          <p className="text-xs text-slate-500">
            Simple vs Full mode, invoice template config, USD/KHR exchange rate, Bakong KHQR merchant setup, VAT, and KDS controls
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdminActor && (
            <select
              aria-label="Admin target tenant settings"
              value={effectiveTenantId}
              onChange={(e) => {
                setTargetTenantId(e.target.value);
                setKhqrVerifyStatus(null);
                setTemplateSavedBanner('');
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900"
            >
              {tenants.map((tn) => (
                <option key={tn.id} value={tn.id}>
                  Admin Settings: {tn.name}
                </option>
              ))}
            </select>
          )}
          {(isAdminActor || (state.isDemoTenant && !platformSettings.demoUsersDisabled)) && (
            <button
              type="button"
              onClick={resetDemoData}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset Sample Data
            </button>
          )}
        </div>
      </div>

      {/* Tenant Ownership Isolation Banner */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-emerald-950 font-medium">
          <Shield className="h-4 w-4 text-emerald-800 shrink-0" />
          <span>
            {isAdminActor
              ? `Super Admin Control · Editing isolated settings & invoice template for tenant "${effectiveTenantState.shopName}" (${effectiveTenantState.businessCode}).`
              : `Tenant Owner Scope · Changes here apply exclusively to your tenant "${effectiveTenantState.shopName}" (${effectiveTenantState.businessCode}).`}
          </span>
        </div>
        <span className="rounded bg-white border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
          Branch: {effectiveBranch.code}
        </span>
      </div>

      {/* Simple Mode vs Full Mode */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Simple mode (counter / takeaway)</h2>
          <p className="text-xs text-slate-500">
            Hides advanced modules (Stock, Reports, Sales Book, Chain) and keeps Sell, Today&apos;s
            money, Bills, and Settings.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
          <input
            type="checkbox"
            checked={effectiveBranch.simpleMode}
            onChange={(e) => updateField('simpleMode', e.target.checked)}
            className="h-4 w-4 accent-emerald-800"
          />
          <span>{effectiveBranch.simpleMode ? 'Simple Mode On' : 'Full Mode Active'}</span>
        </label>
      </div>

      {/* Invoice & Receipt Template Configurator */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-800" />
              Invoice &amp; Receipt Template Config — {effectiveTenantState.shopName}
            </h2>
            <p className="text-xs text-slate-500">
              Customize your tenant&apos;s receipt layout, prefix, Khmer bilingual lines, QR footer, and business header details.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetTemplate}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="h-3 w-3" /> Reset Template Default
          </button>
        </div>

        {templateSavedBanner && (
          <div
            role="status"
            className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-950 font-medium"
          >
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
              {templateSavedBanner}
            </span>
            <button
              type="button"
              onClick={() => setTemplateSavedBanner('')}
              className="text-[11px] text-emerald-800 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Controls */}
          <div className="lg:col-span-7 space-y-4">
            {/* Tenant Branch Identity for Invoices */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Seller Header Identity ({effectiveBranch.code})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="tpl-branch-name" className="block font-semibold text-slate-700 mb-1">
                    Business / Branch Name
                  </label>
                  <input
                    id="tpl-branch-name"
                    value={effectiveBranch.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                  />
                </div>
                <div>
                  <label htmlFor="tpl-vattin" className="block font-semibold text-slate-700 mb-1">
                    Seller VATTIN
                  </label>
                  <input
                    id="tpl-vattin"
                    value={effectiveBranch.vattin}
                    onChange={(e) => updateField('vattin', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="tpl-phone" className="block font-semibold text-slate-700 mb-1">
                    Receipt Phone
                  </label>
                  <input
                    id="tpl-phone"
                    value={effectiveBranch.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                  />
                </div>
                <div>
                  <label htmlFor="tpl-address" className="block font-semibold text-slate-700 mb-1">
                    Store Address
                  </label>
                  <input
                    id="tpl-address"
                    value={effectiveBranch.address}
                    onChange={(e) => updateField('address', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                  />
                </div>
              </div>
            </div>

            {/* Company Icon & Logo */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5 text-emerald-800" />
                  Company Icon &amp; Logo ({effectiveTenantState.shopName})
                </div>
                {effectiveTemplate.logoImageUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      updateTemplatePartial(
                        { logoImageUrl: '' },
                        `Removed custom logo image for ${effectiveTenantState.shopName}`
                      )
                    }
                    className="text-[11px] font-semibold text-red-600 hover:underline"
                  >
                    Remove Logo
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <CompanyLogoBadge
                  logoImageUrl={effectiveTemplate.logoImageUrl}
                  logoIcon={effectiveTemplate.logoIcon}
                  logoText={effectiveTemplate.logoText}
                  alt={`${effectiveTenantState.shopName} company logo`}
                  className="h-14 w-14 rounded-xl text-base"
                  iconClassName="h-6 w-6"
                  bgClassName={INVOICE_ACCENT_STYLES[effectiveTemplate.accentColor].headerBg}
                  textClassName={INVOICE_ACCENT_STYLES[effectiveTemplate.accentColor].headerText}
                />
                <div className="flex-1 min-w-[200px] space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer">
                      <Upload className="h-3.5 w-3.5 text-emerald-800" />
                      <span>{logoUploading ? 'Uploading...' : 'Upload Company Logo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => void handleCompanyLogoUpload(e)}
                        className="sr-only"
                      />
                    </label>
                    <span className="text-[11px] text-slate-500">PNG/JPG auto-optimized for invoices</span>
                  </div>
                  <input
                    id="tpl-logo-url"
                    type="text"
                    aria-label="Company logo image URL"
                    maxLength={MAX_COMPANY_LOGO_URL_LENGTH}
                    value={effectiveTemplate.logoImageUrl}
                    onChange={(e) =>
                      updateTemplatePartial({
                        logoImageUrl: e.target.value,
                        showLogoBadge: true,
                      })
                    }
                    placeholder="Or paste company logo URL (https://... or /src/assets/...)"
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px]"
                  />
                </div>
              </div>

              {logoError && (
                <p role="alert" className="text-[11px] text-red-600 font-medium">
                  {logoError}
                </p>
              )}

              <div>
                <div className="text-[11px] font-semibold text-slate-600 mb-1.5">
                  Or pick a Company Icon badge:
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                  {COMPANY_LOGO_ICONS.map((iconDef) => {
                    const selected =
                      !effectiveTemplate.logoImageUrl && effectiveTemplate.logoIcon === iconDef.id;
                    return (
                      <button
                        key={iconDef.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          updateTemplatePartial(
                            {
                              logoIcon: iconDef.id as CompanyLogoIcon,
                              logoImageUrl: '',
                              showLogoBadge: true,
                            },
                            `Set company icon to "${iconDef.label}" for ${effectiveTenantState.shopName}`
                          )
                        }
                        className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-2 text-[10px] font-semibold transition-colors ${
                          selected
                            ? 'border-emerald-700 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-700'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {iconDef.id === 'monogram' ? (
                          <span className="h-4 flex items-center font-bold text-xs">
                            {effectiveTemplate.logoText || 'AB'}
                          </span>
                        ) : (
                          <CompanyIconGlyph icon={iconDef.id} className="h-4 w-4 text-emerald-800" />
                        )}
                        <span className="truncate w-full text-center">{iconDef.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Template Layout Style */}
            <div className="space-y-2">
              <div className="font-semibold text-slate-700">Template Layout Style</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {INVOICE_TEMPLATE_STYLES.map((st) => {
                  const active = effectiveTemplate.style === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => updateTemplateField('style', st.id)}
                      className={`rounded-lg border p-2.5 text-left transition-colors ${
                        active
                          ? 'border-emerald-700 bg-emerald-50/70 ring-1 ring-emerald-700'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900">{st.name}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          {st.paperLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">{st.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Branding, Title, Prefix & Accent */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-2">
                <label htmlFor="tpl-header-title" className="block font-semibold text-slate-700 mb-1">
                  Invoice Header Title
                </label>
                <input
                  id="tpl-header-title"
                  value={effectiveTemplate.headerTitle}
                  onChange={(e) => updateTemplateField('headerTitle', e.target.value)}
                  placeholder="OFFICIAL RECEIPT / វិក្កយបត្រ"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
              <div>
                <label htmlFor="tpl-prefix" className="block font-semibold text-slate-700 mb-1">
                  Invoice Prefix
                </label>
                <input
                  id="tpl-prefix"
                  maxLength={16}
                  value={effectiveTemplate.invoicePrefix}
                  onChange={(e) => updateTemplateField('invoicePrefix', e.target.value.toUpperCase())}
                  placeholder="BKK1"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono uppercase"
                />
              </div>
              <div>
                <label htmlFor="tpl-logo-text" className="block font-semibold text-slate-700 mb-1">
                  Monogram / Logo Badge
                </label>
                <input
                  id="tpl-logo-text"
                  maxLength={12}
                  value={effectiveTemplate.logoText}
                  onChange={(e) => updateTemplateField('logoText', e.target.value)}
                  placeholder="LC"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-bold"
                />
              </div>
              <div>
                <label htmlFor="tpl-accent" className="block font-semibold text-slate-700 mb-1">
                  Accent Theme
                </label>
                <select
                  id="tpl-accent"
                  aria-label="Invoice accent color"
                  value={effectiveTemplate.accentColor}
                  onChange={(e) =>
                    updateTemplateField('accentColor', e.target.value as InvoiceAccentColor)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
                >
                  {(Object.keys(INVOICE_ACCENT_STYLES) as InvoiceAccentColor[]).map((c) => (
                    <option key={c} value={c}>
                      {INVOICE_ACCENT_STYLES[c].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="tpl-qr-mode" className="block font-semibold text-slate-700 mb-1">
                  QR Footer Mode
                </label>
                <select
                  id="tpl-qr-mode"
                  aria-label="Invoice QR footer mode"
                  value={effectiveTemplate.qrFooterMode}
                  onChange={(e) =>
                    updateTemplateField('qrFooterMode', e.target.value as InvoiceQrFooterMode)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
                >
                  <option value="loyalty_ebill">Loyalty &amp; E-Bill QR</option>
                  <option value="bakong_khqr">Bakong KHQR Pay QR</option>
                  <option value="none">Hide Footer QR</option>
                </select>
              </div>
            </div>

            {effectiveTemplate.style === 'a4_tax_invoice' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="tpl-buyer-sig" className="block font-semibold text-slate-700 mb-1">
                    Buyer Signature Label
                  </label>
                  <input
                    id="tpl-buyer-sig"
                    value={effectiveTemplate.buyerSignatureLabel}
                    onChange={(e) => updateTemplateField('buyerSignatureLabel', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
                  />
                </div>
                <div>
                  <label htmlFor="tpl-seller-sig" className="block font-semibold text-slate-700 mb-1">
                    Seller Signature Label
                  </label>
                  <input
                    id="tpl-seller-sig"
                    value={effectiveTemplate.sellerSignatureLabel}
                    onChange={(e) => updateTemplateField('sellerSignatureLabel', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="tpl-footer-note" className="block font-semibold text-slate-700 mb-1">
                Footer Note / Thank-You Message
              </label>
              <input
                id="tpl-footer-note"
                maxLength={180}
                value={effectiveTemplate.footerNote}
                onChange={(e) => updateTemplateField('footerNote', e.target.value)}
                placeholder="Thank you for visiting! សូមអរគុណ!"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
              />
            </div>

            {/* Visibility Toggles */}
            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Visible Fields on Invoice
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(
                  [
                    ['showLogoBadge', 'Logo Badge'],
                    ['showAddress', 'Store Address'],
                    ['showPhone', 'Phone Number'],
                    ['showVattin', 'Seller VATTIN'],
                    ['showCashier', 'Cashier Name'],
                    ['showKhmerItemNames', 'Khmer Item Names'],
                    ['showItemNotes', 'Item Notes'],
                    ['showVatBreakdown', 'VAT Breakdown'],
                    ['showExchangeRate', 'USD/KHR Rate'],
                  ] as [keyof InvoiceTemplateConfig, string][]
                ).map(([fieldKey, label]) => (
                  <label
                    key={fieldKey}
                    className="flex items-center gap-2 text-slate-700 font-medium cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(effectiveTemplate[fieldKey])}
                      onChange={(e) => updateTemplateField(fieldKey, e.target.checked)}
                      className="h-3.5 w-3.5 accent-emerald-800"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Right Live Preview */}
          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-slate-100/80 p-3 flex flex-col">
            <div className="flex items-center justify-between mb-2.5 px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Live Preview · {effectiveTemplate.style.replace(/_/g, ' ')}
              </span>
              <span className="font-mono text-[11px] font-semibold text-emerald-900">
                {effectiveTemplate.invoicePrefix}-{String(samplePreviewOrder.orderNumber).padStart(5, '0')}
              </span>
            </div>
            <div className="overflow-y-auto max-h-[540px] pr-0.5">
              <ReceiptInvoiceDocument
                order={samplePreviewOrder}
                branch={{ ...effectiveBranch, invoiceTemplate: effectiveTemplate }}
                compactPreview
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bakong KHQR Merchant Setup */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <QrCode className="h-4 w-4 text-[#C81E1E]" />
            <h2 className="text-sm font-bold text-slate-900">Bakong KHQR Merchant Setup</h2>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                isMerchantKhqrConfigured(effectiveBranch.khqrBakongId)
                  ? 'bg-emerald-100 text-emerald-900'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {isMerchantKhqrConfigured(effectiveBranch.khqrBakongId)
                ? 'Configured'
                : 'Optional · Not Set'}
            </span>
          </div>
          <button
            type="button"
            disabled={verifyingKhqr}
            onClick={() => void handleVerifyBakong()}
            className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {verifyingKhqr ? 'Verifying...' : 'Verify Bakong Account'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Account Type</label>
            <select
              aria-label="KHQR account type"
              value={effectiveBranch.khqrAccountType || 'individual'}
              onChange={(e) =>
                updateField('khqrAccountType', e.target.value as 'individual' | 'merchant')
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
            >
              <option value="individual">Individual (Tag 29)</option>
              <option value="merchant">Merchant (Tag 30)</option>
            </select>
          </div>
          <div>
            <label htmlFor="settings-khqr-id" className="block font-semibold text-slate-700 mb-1">
              Bakong Account ID (optional)
            </label>
            <input
              id="settings-khqr-id"
              value={effectiveBranch.khqrBakongId}
              onChange={(e) => {
                const val = e.target.value;
                applyBranchPartial({
                  khqrBakongId: val,
                  bakongConnected: isMerchantKhqrConfigured(val),
                });
              }}
              placeholder="Optional · e.g. lotuscafe@abaa"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Merchant Display Name</label>
            <input
              value={effectiveBranch.khqrAccountName}
              onChange={(e) => updateField('khqrAccountName', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Default KHQR Currency</label>
            <select
              aria-label="Default KHQR currency"
              value={effectiveBranch.khqrDefaultCurrency || 'USD'}
              onChange={(e) => updateField('khqrDefaultCurrency', e.target.value as 'USD' | 'KHR')}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
            >
              <option value="USD">USD (840)</option>
              <option value="KHR">KHR (116)</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Merchant City</label>
            <input
              value={effectiveBranch.khqrCity || 'Phnom Penh'}
              onChange={(e) => updateField('khqrCity', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">MCC (4 digits)</label>
            <input
              value={effectiveBranch.khqrMcc || '5812'}
              maxLength={4}
              onChange={(e) => updateField('khqrMcc', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono"
            />
          </div>
          {(effectiveBranch.khqrAccountType || 'individual') === 'merchant' && (
            <>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Merchant ID</label>
                <input
                  value={effectiveBranch.khqrMerchantId || ''}
                  onChange={(e) => updateField('khqrMerchantId', e.target.value)}
                  placeholder="e.g. M009911"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Acquiring Bank</label>
                <input
                  value={effectiveBranch.khqrAcquiringBank || 'ABA Bank'}
                  onChange={(e) => updateField('khqrAcquiringBank', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
            </>
          )}
        </div>

        {khqrVerifyStatus && (
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
              khqrVerifyStatus.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {khqrVerifyStatus.ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            )}
            <span>{khqrVerifyStatus.msg}</span>
          </div>
        )}
      </div>

      {/* Currency & Tax */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-bold text-slate-900">Currency, rounding &amp; Cambodia VAT</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Exchange Rate (៛ per $1)</label>
            <input
              type="number"
              value={effectiveBranch.exchangeRate}
              onChange={(e) => updateField('exchangeRate', Math.max(1000, Number(e.target.value) || 4100))}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 tabular-nums"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Riel Rounding Step</label>
            <select
              aria-label="Riel rounding step"
              value={effectiveBranch.rielRounding}
              onChange={(e) => updateField('rielRounding', Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
            >
              <option value={100}>Nearest 100 ៛</option>
              <option value={500}>Nearest 500 ៛</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">VAT (%)</label>
            <input
              type="number"
              value={effectiveBranch.vatPercent}
              onChange={(e) => updateField('vatPercent', Math.max(0, Number(e.target.value) || 0))}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 tabular-nums"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Service Charge (%)</label>
            <input
              type="number"
              value={effectiveBranch.serviceChargePercent}
              onChange={(e) =>
                updateField('serviceChargePercent', Math.max(0, Number(e.target.value) || 0))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 tabular-nums"
            />
          </div>
        </div>
      </div>

      {/* Operations & Display */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 text-xs">
        <h2 className="text-sm font-bold text-slate-900">QR ordering, KDS &amp; drawer controls</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Guest QR Mode</label>
            <select
              aria-label="Guest QR mode"
              value={effectiveBranch.qrMode}
              onChange={(e) => updateField('qrMode', e.target.value as 'review' | 'auto')}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
            >
              <option value="review">Review &amp; Approve at Cashier</option>
              <option value="auto">Auto-send directly to Kitchen</option>
            </select>
          </div>
          <label className="flex items-center gap-2 font-semibold text-slate-700 pt-5">
            <input
              type="checkbox"
              checked={effectiveBranch.reservationsEnabled}
              onChange={(e) => updateField('reservationsEnabled', e.target.checked)}
              className="h-4 w-4 accent-emerald-800"
            />
            Enable table reservations &amp; deposits
          </label>
          <label className="flex items-center gap-2 font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={effectiveBranch.blindClose}
              onChange={(e) => updateField('blindClose', e.target.checked)}
              className="h-4 w-4 accent-emerald-800"
            />
            Blind shift close (hide expected cash until Z-report)
          </label>
        </div>
      </div>
    </div>
  );
}
