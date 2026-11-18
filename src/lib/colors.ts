/**
 * Colors.
 *
 * Google's Calendar API still reports calendar/event colors in its legacy palette (e.g. "#9fe1e7"),
 * while Google Calendar on the web shows the current one (e.g. Peacock "#039be5"). We translate the
 * legacy swatches so each calendar looks here exactly like it does in Google. Custom colors (any hex
 * picked in Google) pass through unchanged.
 */

/** Calendar palette: colorId → [legacy hex returned by the API, current hex shown by Google, name]. */
export const GOOGLE_CALENDAR_COLORS: Record<string, [string, string, string]> = {
  "1": ["#ac725e", "#795548", "Cocoa"],
  "2": ["#d06b64", "#e67c73", "Flamingo"],
  "3": ["#f83a22", "#d50000", "Tomato"],
  "4": ["#fa573c", "#f4511e", "Tangerine"],
  "5": ["#ff7537", "#ef6c00", "Pumpkin"],
  "6": ["#ffad46", "#f09300", "Mango"],
  "7": ["#42d692", "#009688", "Eucalyptus"],
  "8": ["#16a765", "#0b8043", "Basil"],
  "9": ["#7bd148", "#7cb342", "Pistachio"],
  "10": ["#b3dc6c", "#c0ca33", "Avocado"],
  "11": ["#fbe983", "#e4c441", "Citron"],
  "12": ["#fad165", "#f6bf26", "Banana"],
  "13": ["#92e1c0", "#33b679", "Sage"],
  "14": ["#9fe1e7", "#039be5", "Peacock"],
  "15": ["#9fc6e7", "#4285f4", "Cobalt"],
  "16": ["#4986e7", "#3f51b5", "Blueberry"],
  "17": ["#9a9cff", "#7986cb", "Lavender"],
  "18": ["#b99aff", "#b39ddb", "Wisteria"],
  "19": ["#c2c2c2", "#616161", "Graphite"],
  "20": ["#cabdbf", "#a79b8e", "Birch"],
  "21": ["#cca6ac", "#ad1457", "Radicchio"],
  "22": ["#f691b2", "#d81b60", "Cherry blossom"],
  "23": ["#cd74e6", "#8e24aa", "Grape"],
  "24": ["#a47ae2", "#9e69af", "Amethyst"],
};

/** Event palette (colorId on a single event). */
export const GOOGLE_EVENT_COLORS: Record<string, [string, string, string]> = {
  "1": ["#a4bdfc", "#7986cb", "Lavender"],
  "2": ["#7ae7bf", "#33b679", "Sage"],
  "3": ["#dbadff", "#8e24aa", "Grape"],
  "4": ["#ff887c", "#e67c73", "Flamingo"],
  "5": ["#fbd75b", "#f6bf26", "Banana"],
  "6": ["#ffb878", "#f4511e", "Tangerine"],
  "7": ["#46d6db", "#039be5", "Peacock"],
  "8": ["#e1e1e1", "#616161", "Graphite"],
  "9": ["#5484ed", "#3f51b5", "Blueberry"],
  "10": ["#51b749", "#0b8043", "Basil"],
  "11": ["#dc2127", "#d50000", "Tomato"],
};

const LEGACY_TO_CURRENT = new Map(Object.values(GOOGLE_CALENDAR_COLORS).map(([legacy, current]) => [legacy, current]));

const norm = (hex: string | null | undefined) => (hex ?? "").trim().toLowerCase();

/** The color a calendar shows in Google Calendar today. */
export function googleCalendarColor(entry: { colorId?: string | null; backgroundColor?: string | null }) {
  const bg = norm(entry.backgroundColor);
  const byId = entry.colorId ? GOOGLE_CALENDAR_COLORS[entry.colorId] : undefined;
  // backgroundColor wins (it reflects custom colors); translate it when it's a legacy swatch.
  if (bg && /^#[0-9a-f]{6}$/.test(bg)) return LEGACY_TO_CURRENT.get(bg) ?? bg;
  return byId?.[1] ?? "#039be5";
}

/** The color of an event that has its own colorId in Google (null = use the calendar's color). */
export const googleEventColor = (colorId: string | null | undefined) => (colorId ? GOOGLE_EVENT_COLORS[colorId]?.[1] ?? null : null);

/** Swatches offered when overriding a calendar's color here (Google's current palette). */
export const CALENDAR_SWATCHES = Object.values(GOOGLE_CALENDAR_COLORS).map(([, hex, name]) => ({ hex, name }));

/** Project palette (keys are stored on Project.color). Same hues as the finance app's chart colors. */
export const PROJECT_COLORS: Record<string, { label: string; hex: string; from: string; to: string }> = {
  blue: { label: "Blue", hex: "#0a6fe0", from: "#cfe3ff", to: "#a9c8ff" },
  violet: { label: "Violet", hex: "#8b3fd6", from: "#eadcff", to: "#cdb3ff" },
  green: { label: "Green", hex: "#1f9d55", from: "#d4f3df", to: "#a7e3bf" },
  orange: { label: "Orange", hex: "#e8590c", from: "#ffe3cc", to: "#ffc59c" },
  pink: { label: "Pink", hex: "#d6336c", from: "#ffd9e6", to: "#ffb3cc" },
  teal: { label: "Teal", hex: "#0c8599", from: "#ccf1f6", to: "#9be3ec" },
  amber: { label: "Amber", hex: "#c27c0e", from: "#fff0c2", to: "#ffdf8a" },
  graphite: { label: "Graphite", hex: "#5c5c57", from: "#ececea", to: "#d6d6d2" },
};
export const projectColor = (key: string | null | undefined) => PROJECT_COLORS[key ?? ""] ?? PROJECT_COLORS.blue;
export const isProjectColor = (key: unknown): key is string => typeof key === "string" && key in PROJECT_COLORS;

/** Relative luminance (WCAG) of a hex color. */
export function luminance(hex: string) {
  const h = norm(hex).replace("#", "");
  if (!/^[0-9a-f]{6}$/.test(h)) return 0.5;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Black or white text, whichever reads better on `hex`. */
export const readableOn = (hex: string) => (luminance(hex) > 0.4 ? "#151513" : "#ffffff");

export const isHex = (s: unknown): s is string => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s.trim());
