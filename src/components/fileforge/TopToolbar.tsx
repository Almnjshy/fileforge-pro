// FileForge Pro — Top Toolbar (bilingual + responsive)
"use client";

import { useState } from "react";
import {
  Menu, Search, Plus, Columns2, MoreVertical,
  ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronRight,
  FolderPlus, FilePlus, LayoutGrid, List, Rows3, Table2,
  Settings, Moon, Sun, Monitor, X, Star, Smartphone,
  PanelLeftClose, PanelLeft, HardDriveDownload, Keyboard, Languages,
  Undo2, Redo2, Palette, Shield, Upload,
} from "lucide-react";
import { useFileForge } from "@/store/fileforge-store";
import { useI18n } from "@/lib/i18n/i18n-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { getPathSegments, getNode, ROOT_IDS } from "@/lib/fileforge/filesystem";
import type { ViewMode, ItemSize, ThemeMode } from "@/lib/fileforge/types";
import { cn } from "@/lib/utils";
import { KeyboardShortcutsHelper } from "./KeyboardShortcutsHelper";
import { UploadZone } from "./UploadZone";
import { CustomizationPanel } from "./CustomizationPanel";
import { SecureVaultPanel } from "./SecureVaultPanel";
import { ViewMenu } from "./ViewMenu";

const VIEW_MODES: { value: ViewMode; labelKey: "viewModeLargeGrid" | "viewModeMediumGrid" | "viewModeSmallGrid" | "viewModeList" | "viewModeCompactList" | "viewModeDetails"; icon: typeof LayoutGrid }[] = [
  { value: "large-grid", labelKey: "viewModeLargeGrid", icon: LayoutGrid },
  { value: "medium-grid", labelKey: "viewModeMediumGrid", icon: LayoutGrid },
  { value: "small-grid", labelKey: "viewModeSmallGrid", icon: LayoutGrid },
  { value: "list", labelKey: "viewModeList", icon: List },
  { value: "compact-list", labelKey: "viewModeCompactList", icon: Rows3 },
  { value: "details", labelKey: "viewModeDetails", icon: Table2 },
];

const SIZE_TO_NUM: Record<ItemSize, number> = { xs: 0, sm: 25, md: 50, lg: 75, xl: 100 };
const NUM_TO_SIZE: Record<number, ItemSize> = { 0: "xs", 25: "sm", 50: "md", 75: "lg", 100: "xl" };

export function TopToolbar() {
  const store = useFileForge();
  const { t, lang, toggleLang } = useI18n();
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const segments = getPathSegments(store.currentPath);
  const currentNode = getNode(store.currentPath);
  const isRTL = lang === "ar";
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;
  const ForwardIcon = isRTL ? ArrowLeft : ArrowRight;

  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-30">
      {/* Row 1: Brand + global actions */}
      <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 h-14">
        <Button variant="ghost" size="icon" onClick={() => store.toggleSidebar()} aria-label={t("toggleSidebar")}>
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2 mr-1 sm:mr-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-sm">
            <HardDriveDownload className="h-4 w-4" />
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-bold leading-none">FileForge Pro</div>
            <div className="text-[10px] text-muted-foreground leading-none mt-0.5">{t("version")}</div>
          </div>
        </div>

        {/* Undo/Redo — desktop only */}
        <div className="hidden md:flex items-center gap-0.5 ml-2">
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            disabled={!store.canUndo()}
            onClick={() => store.performUndo()}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            disabled={!store.canRedo()}
            onClick={() => store.performRedo()}
            aria-label="Redo"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1" />

        {/* Search bar — collapsible */}
        <div className={cn(
          "relative transition-all",
          searchOpen ? "w-full max-w-[200px] sm:max-w-md" : "w-9 sm:w-9"
        )}>
          {searchOpen ? (
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                placeholder={t("searchPlaceholder")}
                value={store.searchQuery}
                onChange={(e) => {
                  store.setSearchQuery(e.target.value);
                  store.runSearch();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    store.openWindow({
                      type: "search",
                      title: t("searchResults"),
                      width: 800,
                      height: 560,
                    });
                    setSearchOpen(false);
                  }
                  if (e.key === "Escape") {
                    setSearchOpen(false);
                    store.setSearchQuery("");
                  }
                }}
                className="h-9"
              />
              <Button
                variant="ghost" size="icon"
                onClick={() => { setSearchOpen(false); store.setSearchQuery(""); }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost" size="icon"
              onClick={() => setSearchOpen(true)}
              aria-label={t("search")}
            >
              <Search className="h-5 w-5" />
            </Button>
          )}
        </div>

        {/* New (create) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t("create")}>
              <Plus className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>{t("createNew")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => {
              const name = prompt(t("folderName"), t("newFolderDefault"));
              if (name) store.createFolder(store.currentPath, name);
            }}>
              <FolderPlus className="mr-2 h-4 w-4" /> {t("newFolder")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              const name = prompt(t("fileName"), t("newFileDefault"));
              if (name) store.createFile(store.currentPath, name, "");
            }}>
              <FilePlus className="mr-2 h-4 w-4" /> {t("newFile")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Dual pane toggle */}
        <Button
          variant={store.dualPane ? "secondary" : "ghost"}
          size="icon"
          onClick={() => store.toggleDualPane()}
          aria-label={t("toggleDualPane")}
          title={t("toggleDualPane")}
        >
          <Columns2 className="h-5 w-5" />
        </Button>

        {/* View mode + size + sort + group */}
        <ViewMenu />

        {/* Language toggle */}
        <Button
          variant="ghost" size="icon"
          onClick={toggleLang}
          aria-label="Language"
          title={lang === "ar" ? "English" : "العربية"}
        >
          <Languages className="h-5 w-5" />
          <span className="text-[10px] font-bold ml-1">{lang === "ar" ? "EN" : "ع"}</span>
        </Button>

        {/* Keyboard shortcuts */}
        <Button
          variant="ghost" size="icon"
          className="hidden md:inline-flex"
          onClick={() => setShortcutsOpen(true)}
          aria-label={t("keyboardShortcuts")}
          title={t("keyboardShortcuts")}
        >
          <Keyboard className="h-5 w-5" />
        </Button>

        {/* More menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t("more")}>
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{t("storage")}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => store.openWindow({
              type: "storage-analyzer", title: t("storageAnalyzer"), width: 820, height: 600,
            })}>
              <HardDriveDownload className="mr-2 h-4 w-4" /> {t("storageAnalyzer")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => store.openWindow({
              type: "settings", title: t("secureVault"), width: 480, height: 560,
            })}>
              <Shield className="mr-2 h-4 w-4" /> {t("secureVault")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => store.openWindow({
              type: "settings", title: "Customization", width: 540, height: 600,
            })}>
              <Palette className="mr-2 h-4 w-4" /> Customization
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("theme")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={store.theme} onValueChange={(v) => store.setTheme(v as ThemeMode)}>
              <DropdownMenuRadioItem value="light"><Sun className="mr-2 h-4 w-4" /> {t("light")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark"><Moon className="mr-2 h-4 w-4" /> {t("dark")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system"><Monitor className="mr-2 h-4 w-4" /> {t("system")}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => store.openWindow({
              type: "settings", title: t("settings"), width: 640, height: 520,
            })}>
              <Settings className="mr-2 h-4 w-4" /> {t("settings")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Row 2: Navigation + Breadcrumb */}
      <div className="flex items-center gap-1 px-2 sm:px-3 h-10 border-t">
        <Button
          variant="ghost" size="icon"
          className="h-8 w-8"
          disabled={store.historyIndex <= 0}
          onClick={() => store.goBack()}
          aria-label={t("back")}
        >
          <BackIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost" size="icon"
          className="h-8 w-8"
          disabled={store.historyIndex >= store.history.length - 1}
          onClick={() => store.goForward()}
          aria-label={t("forward")}
        >
          <ForwardIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost" size="icon"
          className="h-8 w-8"
          disabled={!currentNode?.parentId}
          onClick={() => store.goUp()}
          aria-label={t("up")}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Upload button */}
        <UploadZone parentId={store.currentPath} />

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Breadcrumb */}
        <div className="flex-1 min-w-0 overflow-x-auto scrollbar-thin">
          <div className="flex items-center gap-0.5 whitespace-nowrap">
            {segments.length === 0 && (
              <span className="text-sm text-muted-foreground px-2">—</span>
            )}
            {segments.map((seg, idx) => {
              const isLast = idx === segments.length - 1;
              const isRoot = seg.path === ROOT_IDS.internal || seg.path === ROOT_IDS.sdCard || seg.path === ROOT_IDS.usb || seg.path === ROOT_IDS.ftp || seg.path === ROOT_IDS.smb || seg.path === ROOT_IDS.cloud;
              const shouldCollapse = segments.length > 3 && idx > 0 && idx < segments.length - 1;
              if (shouldCollapse && idx === 1) {
                return (
                  <span key={seg.path} className="flex items-center">
                    <Button variant="ghost" size="sm" className="h-7 px-1 text-muted-foreground" disabled>
                      …
                    </Button>
                    <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground mx-0.5", isRTL && "rotate-180")} />
                  </span>
                );
              }
              if (shouldCollapse) return null;
              return (
                <span key={seg.path} className="flex items-center">
                  <Button
                    variant={isLast ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2 text-sm font-normal max-w-[120px] sm:max-w-none"
                    onClick={() => store.navigate(seg.path)}
                  >
                    {isRoot && <Smartphone className="h-3.5 w-3.5 mr-1.5 text-muted-foreground flex-shrink-0" />}
                    <span className="truncate">{seg.name}</span>
                  </Button>
                  {!isLast && <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground mx-0.5 flex-shrink-0", isRTL && "rotate-180")} />}
                </span>
              );
            })}
          </div>
        </div>

        {/* Window manager indicator */}
        {store.windows.length > 0 && (
          <div className="flex items-center gap-1 px-2 ml-2 rounded-md bg-muted/50 text-xs flex-shrink-0">
            <Columns2 className="h-3.5 w-3.5" />
            <span className="font-medium">{store.windows.length}</span>
            <span className="text-muted-foreground hidden sm:inline">{t("windowsCount")}</span>
          </div>
        )}
      </div>

      {shortcutsOpen && <KeyboardShortcutsHelper onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}

function ViewModeControl() {
  const store = useFileForge();
  const { t } = useI18n();
  const currentMode = VIEW_MODES.find(m => m.value === store.viewMode) ?? VIEW_MODES[1];
  const CurrentIcon = currentMode.icon;

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("viewMode")} title={`${t("viewMode")}: ${t(currentMode.labelKey)}`}>
            <CurrentIcon className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{t("viewMode")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {VIEW_MODES.map(m => {
            const Icon = m.icon;
            return (
              <DropdownMenuItem
                key={m.value}
                onClick={() => store.setViewMode(m.value)}
                className={cn(store.viewMode === m.value && "bg-accent")}
              >
                <Icon className="mr-2 h-4 w-4" />
                <span className="flex-1">{t(m.labelKey)}</span>
                {store.viewMode === m.value && <ChevronDown className="h-3 w-3 rotate-[-90deg]" />}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>{t("itemSize")}</span>
            <span className="text-[10px] text-muted-foreground uppercase">{store.itemSize}</span>
          </DropdownMenuLabel>
          <div className="px-2 py-1">
            <Slider
              value={[SIZE_TO_NUM[store.itemSize]]}
              min={0} max={100} step={25}
              onValueChange={(v) => store.setItemSize(NUM_TO_SIZE[v[0]])}
              className="my-2"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{t("small")}</span><span>{t("large")}</span>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => store.setApplyToAll(!store.applyToAll)}>
            <div className="flex items-center w-full">
              <span className="flex-1">{store.applyToAll ? `✓ ${t("applyToAllFolders")}` : t("applyToThisFolder")}</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sidebar pin toggle — desktop only */}
      <Button
        variant={store.sidebarPinned ? "secondary" : "ghost"}
        size="icon"
        className="hidden lg:inline-flex"
        onClick={() => store.setSidebarPinned(!store.sidebarPinned)}
        aria-label={store.sidebarPinned ? t("unpinSidebar") : t("pinSidebar")}
        title={store.sidebarPinned ? t("unpinSidebar") : t("pinSidebar")}
      >
        {store.sidebarPinned ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
      </Button>
    </div>
  );
}
