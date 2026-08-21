// FileForge Pro — Professional View Menu
//
// Organized like Windows File Explorer's view menu, adapted for mobile.
// All options are wired to real state — no decorative toggles.
//
// Sections:
//   1. View Mode (8 options)
//   2. Item Size (slider)
//   3. Show (thumbnails, extensions, hidden, folder count)
//   4. Sort By (6 keys + direction + folders first)
//   5. Group By (5 options)
//   6. Additional Options (density, columns, per-folder, save default, reset)

"use client";

import { useState } from "react";
import {
  LayoutGrid, Grid3x3, Grid2x2, Grid, List, Rows3, FileText, Table2,
  Image as ImageIcon, FileTextIcon, Eye, FolderTree,
  ArrowUpNarrowWide, ArrowDownWideNarrow, Folder,
  Settings2, ChevronRight, ChevronLeft, Check, Sliders,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useFileForge } from "@/store/fileforge-store";
import { useI18n } from "@/lib/i18n/i18n-store";
import { cn } from "@/lib/utils";
import type { ViewMode, SortKey, GroupBy, Density, ColumnConfig } from "@/lib/fileforge/types";

const VIEW_MODES: { value: ViewMode; icon: typeof LayoutGrid }[] = [
  { value: "xlarge-grid", icon: LayoutGrid },
  { value: "large-grid", icon: Grid3x3 },
  { value: "medium-grid", icon: Grid2x2 },
  { value: "small-grid", icon: Grid },
  { value: "list", icon: List },
  { value: "compact-list", icon: Rows3 },
  { value: "content", icon: FileText },
  { value: "details", icon: Table2 },
];

const SORT_KEYS: { value: SortKey; labelKey: string }[] = [
  { value: "name", labelKey: "name" },
  { value: "size", labelKey: "size" },
  { value: "type", labelKey: "type" },
  { value: "extension", labelKey: "extension" },
  { value: "modified", labelKey: "modified" },
  { value: "created", labelKey: "created" },
];

const GROUP_OPTIONS: { value: GroupBy; label: string; labelAr: string }[] = [
  { value: "none", label: "None", labelAr: "بدون تجميع" },
  { value: "name", label: "Name", labelAr: "الاسم" },
  { value: "type", label: "Type", labelAr: "النوع" },
  { value: "date", label: "Date", labelAr: "التاريخ" },
  { value: "size", label: "Size", labelAr: "الحجم" },
];

const DENSITY_OPTIONS: { value: Density; label: string; labelAr: string }[] = [
  { value: "comfortable", label: "Comfortable", labelAr: "مريحة" },
  { value: "standard", label: "Standard", labelAr: "قياسية" },
  { value: "compact", label: "Compact", labelAr: "مضغوطة" },
];

const COLUMN_KEYS: { key: keyof ColumnConfig; label: string; labelAr: string }[] = [
  { key: "name", label: "Name", labelAr: "الاسم" },
  { key: "type", label: "Type", labelAr: "النوع" },
  { key: "size", label: "Size", labelAr: "الحجم" },
  { key: "modified", label: "Modified", labelAr: "آخر تعديل" },
  { key: "created", label: "Created", labelAr: "تاريخ الإنشاء" },
  { key: "extension", label: "Extension", labelAr: "الامتداد" },
  { key: "dimensions", label: "Dimensions", labelAr: "الأبعاد" },
  { key: "duration", label: "Duration", labelAr: "المدة" },
  { key: "itemCount", label: "Folder Items", labelAr: "عناصر المجلد" },
  { key: "path", label: "Path", labelAr: "المسار" },
];

const SIZE_TO_NUM = { xs: 0, sm: 25, md: 50, lg: 75, xl: 100 };
const NUM_TO_SIZE = ["xs", "sm", "md", "lg", "xl"] as const;

export function ViewMenu() {
  const store = useFileForge();
  const { t, lang } = useI18n();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const tr = (en: string, ar: string) => lang === "ar" ? ar : en;
  const currentMode = VIEW_MODES.find(m => m.value === store.viewMode) ?? VIEW_MODES[2];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("viewMode")} title={t("viewMode")}>
          <currentMode.icon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-h-[80vh] overflow-y-auto">
        {/* === View Mode === */}
        <DropdownMenuLabel>{tr("View Mode", "طريقة العرض")}</DropdownMenuLabel>
        {VIEW_MODES.map(m => (
          <DropdownMenuItem
            key={m.value}
            onClick={() => store.setViewMode(m.value)}
            className={cn(store.viewMode === m.value && "bg-accent")}
          >
            <m.icon className="h-4 w-4 mr-2" />
            <span className="flex-1">{tr(
              m.value === "xlarge-grid" ? "Extra Large Grid" :
              m.value === "large-grid" ? "Large Grid" :
              m.value === "medium-grid" ? "Medium Grid" :
              m.value === "small-grid" ? "Small Grid" :
              m.value === "list" ? "List" :
              m.value === "compact-list" ? "Compact List" :
              m.value === "content" ? "Content" : "Details",
              m.value === "xlarge-grid" ? "شبكة كبيرة جدًا" :
              m.value === "large-grid" ? "شبكة كبيرة" :
              m.value === "medium-grid" ? "شبكة متوسطة" :
              m.value === "small-grid" ? "شبكة صغيرة" :
              m.value === "list" ? "قائمة" :
              m.value === "compact-list" ? "قائمة صغيرة" :
              m.value === "content" ? "محتوى" : "تفاصيل"
            )}</span>
            {store.viewMode === m.value && <Check className="h-3 w-3" />}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/* === Item Size Slider === */}
        <div className="px-2 py-2">
          <div className="flex items-center gap-2 mb-1">
            <Sliders className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">{tr("Item Size", "حجم العنصر")}</span>
          </div>
          <Slider
            value={[SIZE_TO_NUM[store.itemSize]]}
            max={100}
            step={25}
            onValueChange={(v) => store.setItemSize(NUM_TO_SIZE[Math.round(v[0] / 25)])}
          />
        </div>

        <DropdownMenuSeparator />

        {/* === Show section === */}
        <DropdownMenuLabel>{tr("Show", "إظهار")}</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={store.showThumbnails}
          onCheckedChange={(v) => store.setShowThumbnails(!!v)}
        >
          <ImageIcon className="h-3.5 w-3.5 mr-2" />
          {tr("Thumbnails", "الصور المصغرة")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={store.showExtensions}
          onCheckedChange={(v) => store.setShowExtensions(!!v)}
        >
          <FileTextIcon className="h-3.5 w-3.5 mr-2" />
          {tr("File Extensions", "امتدادات الملفات")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={store.showHidden}
          onCheckedChange={(v) => useFileForge.setState({ showHidden: !!v } as any)}
        >
          <Eye className="h-3.5 w-3.5 mr-2" />
          {tr("Hidden Files", "الملفات المخفية")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={store.showFolderItemCount}
          onCheckedChange={(v) => store.setShowFolderItemCount(!!v)}
        >
          <FolderTree className="h-3.5 w-3.5 mr-2" />
          {tr("Folder Item Count", "عدد عناصر المجلد")}
        </DropdownMenuCheckboxItem>

        <DropdownMenuSeparator />

        {/* === Sort By === */}
        <DropdownMenuLabel>{tr("Sort By", "ترتيب حسب")}</DropdownMenuLabel>
        {SORT_KEYS.map(s => (
          <DropdownMenuItem
            key={s.value}
            onClick={() => store.setSortKey(s.value)}
            className={cn(store.sortKey === s.value && "bg-accent")}
          >
            <span className="flex-1">{tr(t(s.labelKey as any), s.labelKey === "name" ? "الاسم" : s.labelKey === "size" ? "الحجم" : s.labelKey === "type" ? "النوع" : s.labelKey === "extension" ? "الامتداد" : s.labelKey === "modified" ? "آخر تعديل" : "تاريخ الإنشاء")}</span>
            {store.sortKey === s.value && <Check className="h-3 w-3" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => store.setSortDir("asc")} className={cn(store.sortDir === "asc" && "bg-accent")}>
          <ArrowUpNarrowWide className="h-3.5 w-3.5 mr-2" />
          {tr("Ascending", "تصاعدي")}
          {store.sortDir === "asc" && <Check className="h-3 w-3 ml-auto" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => store.setSortDir("desc")} className={cn(store.sortDir === "desc" && "bg-accent")}>
          <ArrowDownWideNarrow className="h-3.5 w-3.5 mr-2" />
          {tr("Descending", "تنازلي")}
          {store.sortDir === "desc" && <Check className="h-3 w-3 ml-auto" />}
        </DropdownMenuItem>
        <DropdownMenuCheckboxItem
          checked={store.foldersFirst}
          onCheckedChange={(v) => store.setFoldersFirst(!!v)}
        >
          <Folder className="h-3.5 w-3.5 mr-2" />
          {tr("Folders First", "المجلدات أولًا")}
        </DropdownMenuCheckboxItem>

        <DropdownMenuSeparator />

        {/* === Group By === */}
        <DropdownMenuLabel>{tr("Group By", "تجميع حسب")}</DropdownMenuLabel>
        {GROUP_OPTIONS.map(g => (
          <DropdownMenuItem
            key={g.value}
            onClick={() => store.setGroupBy(g.value)}
            className={cn(store.groupBy === g.value && "bg-accent")}
          >
            <span className="flex-1">{lang === "ar" ? g.labelAr : g.label}</span>
            {store.groupBy === g.value && <Check className="h-3 w-3" />}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/* === Advanced Options === */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Settings2 className="h-4 w-4 mr-2" />
            {tr("Additional Options", "خيارات إضافية")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64 max-h-[70vh] overflow-y-auto">
            {/* Density */}
            <DropdownMenuLabel>{tr("Density", "كثافة العرض")}</DropdownMenuLabel>
            {DENSITY_OPTIONS.map(d => (
              <DropdownMenuItem
                key={d.value}
                onClick={() => store.setDensity(d.value)}
                className={cn(store.density === d.value && "bg-accent")}
              >
                <span className="flex-1">{lang === "ar" ? d.labelAr : d.label}</span>
                {store.density === d.value && <Check className="h-3 w-3" />}
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator />

            {/* Columns (for Details view) */}
            <DropdownMenuLabel>{tr("Columns", "الأعمدة")}</DropdownMenuLabel>
            {COLUMN_KEYS.map(c => (
              <DropdownMenuCheckboxItem
                key={c.key}
                checked={store.visibleColumns[c.key]}
                onCheckedChange={() => store.toggleColumn(c.key)}
              >
                {lang === "ar" ? c.labelAr : c.label}
              </DropdownMenuCheckboxItem>
            ))}

            <DropdownMenuSeparator />

            {/* Per-folder settings */}
            <DropdownMenuItem onClick={() => store.applyToThisFolder()}>
              {tr("Apply to This Folder", "تطبيق على هذا المجلد")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => store.saveAsDefaultView()}>
              {tr("Use as Default View", "استخدام كعرض افتراضي")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => store.resetViewSettings()}>
              {tr("Reset View Settings", "إعادة تعيين إعدادات العرض")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
