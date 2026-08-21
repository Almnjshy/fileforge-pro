// FileForge Pro — Customization Panel (backgrounds, accent, accessibility)
"use client";

import { useI18n } from "@/lib/i18n/i18n-store";
import { useCustomization, getAccentClasses, type AccentColor, type BackgroundType } from "@/lib/fileforge/customization";
import { Palette, Accessibility, Image, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const ACCENTS: { value: AccentColor; label: string; classes: string }[] = [
  { value: "orange", label: "Orange", classes: "bg-gradient-to-br from-orange-500 to-amber-600" },
  { value: "blue", label: "Blue", classes: "bg-gradient-to-br from-blue-500 to-cyan-600" },
  { value: "green", label: "Green", classes: "bg-gradient-to-br from-emerald-500 to-teal-600" },
  { value: "purple", label: "Purple", classes: "bg-gradient-to-br from-violet-500 to-purple-600" },
  { value: "pink", label: "Pink", classes: "bg-gradient-to-br from-pink-500 to-rose-600" },
  { value: "teal", label: "Teal", classes: "bg-gradient-to-br from-teal-500 to-cyan-600" },
  { value: "red", label: "Red", classes: "bg-gradient-to-br from-red-500 to-orange-600" },
];

const BACKGROUNDS: { value: BackgroundType; label: string; preview: string }[] = [
  { value: "default", label: "Default", preview: "bg-background" },
  { value: "gradient", label: "Gradient", preview: "bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20" },
  { value: "pattern", label: "Pattern", preview: "bg-muted" },
];

export function CustomizationPanel() {
  const { t } = useI18n();
  const cust = useCustomization();

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-5">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Palette className="h-5 w-5" /> Customization
        </h2>
        <p className="text-xs text-muted-foreground">Personalize your experience</p>
      </div>

      {/* Accent Color */}
      <Section icon={Palette} title="Accent Color">
        <div className="grid grid-cols-7 gap-2">
          {ACCENTS.map(a => (
            <button
              key={a.value}
              onClick={() => cust.setAccent(a.value)}
              className={cn(
                "h-10 rounded-lg transition-all",
                a.classes,
                cust.accent === a.value ? "ring-2 ring-offset-2 ring-foreground scale-105" : "hover:scale-105"
              )}
              title={a.label}
            />
          ))}
        </div>
      </Section>

      {/* Background */}
      <Section icon={Image} title="Background">
        <div className="grid grid-cols-3 gap-2">
          {BACKGROUNDS.map(bg => (
            <button
              key={bg.value}
              onClick={() => cust.setBackground(bg.value)}
              className={cn(
                "h-16 rounded-lg border-2 transition-all overflow-hidden",
                cust.background === bg.value ? "border-orange-500" : "border-border",
                bg.preview
              )}
            >
              <span className="text-xs font-medium">{bg.label}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Icon Size */}
      <Section icon={Type} title="Custom Icon Size">
        <div className="text-xs text-muted-foreground mb-2">
          Override default size (default: auto based on view mode)
        </div>
        <Slider
          value={[cust.customIconSize ?? 50]}
          min={0} max={100} step={5}
          onValueChange={(v) => cust.setCustomIconSize(v[0] === 50 ? null : v[0])}
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>Smaller</span>
          <span>{cust.customIconSize === null ? "Auto" : `${cust.customIconSize}%`}</span>
          <span>Larger</span>
        </div>
        <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => cust.setCustomIconSize(null)}>
          Reset to Auto
        </Button>
      </Section>

      <Separator />

      {/* Accessibility */}
      <Section icon={Accessibility} title="Accessibility">
        <ToggleRow
          label="High Contrast Mode"
          description="Increase contrast for better visibility"
          checked={cust.highContrast}
          onChange={cust.setHighContrast}
        />
        <ToggleRow
          label="Reduced Motion"
          description="Minimize animations and transitions"
          checked={cust.reducedMotion}
          onChange={cust.setReducedMotion}
        />
      </Section>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Palette; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-orange-500" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="pl-6 space-y-2">{children}</div>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
