import {
  ArrowRight,
  Command,
  Database,
  Layers,
  PlusCircle,
  Search,
  Sparkles,
  Store,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePos } from '../context/PosContext';
import { getNavLabel } from '../data/i18n';
import { isModuleEnabledForTenant, SAAS_MODULE_REGISTRY } from '../modules/registry';
import { canAccessNavSection } from '../utils/permissions';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface PaletteActionItem {
  id: string;
  category: 'Modules' | 'Quick Actions' | 'Branches' | 'Catalog';
  title: string;
  subtitle: string;
  badge?: string;
  onSelect: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const {
    state,
    activeBranch,
    activeStaff,
    language,
    setNavSection,
    setExternalMode,
    createTakeAwayOrder,
    switchBranch,
    updateBranchSettings,
    notify,
  } = usePos();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const items = useMemo<PaletteActionItem[]>(() => {
    const list: PaletteActionItem[] = [];

    // 1. Accessible SaaS Modules
    for (const mod of SAAS_MODULE_REGISTRY) {
      if (!canAccessNavSection(activeStaff, mod.id, state.ownerPermissions)) continue;
      if (
        !isModuleEnabledForTenant(
          mod.id,
          state.featureFlags,
          activeBranch.reservationsEnabled
        )
      ) {
        continue;
      }
      const localized = getNavLabel(mod.id, language);
      list.push({
        id: `mod_${mod.id}`,
        category: 'Modules',
        title: `${localized} (${mod.title})`,
        subtitle: mod.subtitle,
        badge: mod.shortcutHint || mod.group.replace('_', ' '),
        onSelect: () => {
          setNavSection(mod.id);
          onClose();
        },
      });
    }

    // 2. Quick Operational Actions
    list.push({
      id: 'act_takeaway',
      category: 'Quick Actions',
      title: 'New Take-away Order',
      subtitle: 'Create an instant counter take-away ticket in POS',
      badge: 'Action',
      onSelect: () => {
        createTakeAwayOrder('take_away');
        setNavSection('sell');
        onClose();
        notify('Opened new Take-away order', 'success');
      },
    });

    list.push({
      id: 'act_kds_screen',
      category: 'Quick Actions',
      title: 'Open Dedicated Kitchen Screen (/kds)',
      subtitle: 'Switch to full-screen KDS mode for kitchen or bar monitors',
      badge: 'Screen',
      onSelect: () => {
        setExternalMode('kds');
        onClose();
      },
    });

    list.push({
      id: 'act_qr_preview',
      category: 'Quick Actions',
      title: 'Preview Guest Self-Order QR Menu (/qr)',
      subtitle: 'Test table QR ordering and guest service alerts',
      badge: 'Screen',
      onSelect: () => {
        setExternalMode('qr');
        onClose();
      },
    });

    list.push({
      id: 'act_simple_mode',
      category: 'Quick Actions',
      title: activeBranch.simpleMode
        ? 'Disable Simple Counter Mode (Show All Modules)'
        : 'Enable Simple Counter Mode (Streamlined Sidebar)',
      subtitle: 'Toggle streamlined counter view for fast cashier shifts',
      badge: 'UX',
      onSelect: () => {
        updateBranchSettings({ simpleMode: !activeBranch.simpleMode });
        onClose();
        notify(
          !activeBranch.simpleMode ? 'Simple mode enabled' : 'Full SaaS sidebar restored',
          'info'
        );
      },
    });

    // 3. Branches
    for (const b of state.branches) {
      if (b.id === activeBranch.id) continue;
      list.push({
        id: `branch_${b.id}`,
        category: 'Branches',
        title: `Switch to Branch: ${b.name}`,
        subtitle: `${b.code} · ${b.address}`,
        badge: b.code,
        onSelect: () => {
          switchBranch(b.id);
          onClose();
          notify(`Switched active branch to ${b.name}`, 'info');
        },
      });
    }

    // 4. Menu Items (Jump to catalog or quick sell)
    const branchMenu = state.menuItems.filter((m) => m.branchId === activeBranch.id && m.active);
    for (const m of branchMenu.slice(0, 40)) {
      list.push({
        id: `item_${m.id}`,
        category: 'Catalog',
        title: `${m.nameEn} · $${m.priceUsd.toFixed(2)}`,
        subtitle: `${m.nameKh} · ${m.category}`,
        badge: m.station.toUpperCase(),
        onSelect: () => {
          setNavSection('sell');
          onClose();
        },
      });
    }

    const q = query.trim().toLowerCase();
    if (!q) return list.slice(0, 18);

    return list.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.badge && item.badge.toLowerCase().includes(q))
    );
  }, [
    activeStaff,
    state.ownerPermissions,
    state.featureFlags,
    state.branches,
    state.menuItems,
    activeBranch,
    language,
    query,
    setNavSection,
    onClose,
    createTakeAwayOrder,
    notify,
    setExternalMode,
    updateBranchSettings,
    switchBranch,
  ]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (items.length ? (prev + 1) % items.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          items.length ? (prev - 1 + items.length) % items.length : 0
        );
      } else if (e.key === 'Enter' && items[selectedIndex]) {
        e.preventDefault();
        items[selectedIndex].onSelect();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, items, selectedIndex, onClose]);

  if (!open) return null;

  const getCategoryIcon = (cat: PaletteActionItem['category']) => {
    switch (cat) {
      case 'Modules':
        return <Layers size={15} className="text-emerald-600" />;
      case 'Quick Actions':
        return <Sparkles size={15} className="text-amber-600" />;
      case 'Branches':
        return <Store size={15} className="text-blue-600" />;
      case 'Catalog':
        return <UtensilsCrossed size={15} className="text-purple-600" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-start justify-center pt-14 sm:pt-20 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200 bg-slate-50/70">
          <Search size={18} className="text-emerald-700 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to any SaaS module, branch, menu item, or action..."
            className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-slate-500 bg-white border border-slate-200 rounded-md">
            ESC
          </kbd>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
            aria-label="Close command palette"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[62vh] overflow-y-auto divide-y divide-slate-100">
          {items.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              No matching modules, dishes, or actions for "{query}".
            </div>
          ) : (
            items.map((item, idx) => {
              const active = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={item.onSelect}
                  className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left transition ${
                    active ? 'bg-emerald-50/90' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                        active
                          ? 'bg-white border-emerald-200 shadow-2xs'
                          : 'bg-slate-50 border-slate-200/80'
                      }`}
                    >
                      {getCategoryIcon(item.category)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {item.title}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{item.subtitle}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.badge && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-600">
                        {item.badge}
                      </span>
                    )}
                    <ArrowRight
                      size={14}
                      className={active ? 'text-emerald-700' : 'text-slate-300'}
                    />
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Command size={12} /> <strong>↑↓</strong> Navigate
            </span>
            <span>
              <strong>↵</strong> Open
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
            <Database size={12} /> SQLite Multi-Tenant SaaS v2
          </span>
        </div>
      </div>
    </div>
  );
}
