import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type AccentColor,
  type AppearancePreferences,
  type ResolvedTheme,
  type ThemeMode,
  accentColors,
  themeModes,
} from "./appearance.js";

interface AppearanceMenuProps {
  readonly locale: "en" | "zh-CN";
  readonly preferences: AppearancePreferences;
  readonly resolvedTheme: ResolvedTheme;
  readonly onChange: (preferences: AppearancePreferences) => void;
}

export function AppearanceMenu(props: AppearanceMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const zh = props.locale === "zh-CN";

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const activeIcon =
    props.preferences.mode === "system" ? props.resolvedTheme : props.preferences.mode;

  return (
    <div className="appearance-menu" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={zh ? "外观设置" : "Appearance"}
        className="icon-button"
        onClick={() => setOpen((current) => !current)}
        ref={buttonRef}
        title={zh ? "外观设置" : "Appearance"}
        type="button"
      >
        {activeIcon === "dark" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
      </button>
      {open && (
        <section
          aria-label={zh ? "外观设置" : "Appearance settings"}
          className="appearance-popover panel"
        >
          <div className="appearance-heading">
            <strong>{zh ? "外观" : "Appearance"}</strong>
            <span>{zh ? "选择显示模式与主题色" : "Choose a mode and accent"}</span>
          </div>
          <fieldset className="theme-segments">
            <legend className="sr-only">{zh ? "显示模式" : "Color mode"}</legend>
            {themeModes.map((mode) => (
              <button
                aria-pressed={props.preferences.mode === mode}
                className={props.preferences.mode === mode ? "selected" : undefined}
                key={mode}
                onClick={() => props.onChange({ ...props.preferences, mode })}
                type="button"
              >
                {mode === "system" ? (
                  <Monitor aria-hidden="true" />
                ) : mode === "dark" ? (
                  <Moon aria-hidden="true" />
                ) : (
                  <Sun aria-hidden="true" />
                )}
                <span>{themeModeLabel(mode, zh)}</span>
              </button>
            ))}
          </fieldset>
          <fieldset className="accent-options">
            <legend>{zh ? "主题色" : "Accent color"}</legend>
            <div>
              {accentColors.map((accent) => (
                <button
                  aria-label={accentLabel(accent, zh)}
                  aria-pressed={props.preferences.accent === accent}
                  className="accent-swatch"
                  data-accent-option={accent}
                  key={accent}
                  onClick={() => props.onChange({ ...props.preferences, accent })}
                  title={accentLabel(accent, zh)}
                  type="button"
                >
                  <span aria-hidden="true" />
                  {props.preferences.accent === accent && <Check aria-hidden="true" />}
                </button>
              ))}
            </div>
          </fieldset>
        </section>
      )}
    </div>
  );
}

function themeModeLabel(mode: ThemeMode, zh: boolean): string {
  const labels: Record<ThemeMode, readonly [string, string]> = {
    dark: ["深色", "Dark"],
    light: ["浅色", "Light"],
    system: ["跟随系统", "System"],
  };
  return labels[mode][zh ? 0 : 1];
}

function accentLabel(accent: AccentColor, zh: boolean): string {
  const labels: Record<AccentColor, readonly [string, string]> = {
    amber: ["琥珀", "Amber"],
    blue: ["蓝色", "Blue"],
    green: ["绿色", "Green"],
    violet: ["紫色", "Violet"],
  };
  return labels[accent][zh ? 0 : 1];
}
