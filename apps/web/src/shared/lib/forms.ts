export const fieldLimits = {
  displayName: 80,
  bio: 2000,
  skills: 20,
  goals: 5,
  links: 5,
  link: 2048,
  title: 120,
  description: 5000,
  role: 80,
  roles: 10,
  application: 2000,
  message: 4000,
} as const;

// Match JSON Schema length semantics for Unicode instead of counting UTF-16 units.
export const textLength = (text: string) => Array.from(text).length;
export const within = (text: string, max: number) =>
  textLength(text) <= max || `Не больше ${max} символов.`;
export const nonblank = (text: string) =>
  /\S/u.test(text) || "Заполните это поле.";

export function parseLinks(text: string): string[] {
  return text
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function validateLinks(text: string): true | string {
  const links = parseLinks(text);
  if (links.length > fieldLimits.links) return "Не больше 5 ссылок.";
  for (const link of links) {
    if (textLength(link) > fieldLimits.link || /\s/u.test(link))
      return "Проверьте длину и формат ссылки.";
    try {
      const url = new URL(link);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        !url.hostname ||
        !/^https?:\/\/[^/?#\\]/i.test(link)
      )
        return "Укажите полную ссылку с http:// или https://.";
    } catch {
      return "Укажите полную ссылку с http:// или https://.";
    }
  }
  return true;
}

const unsafePathCharacters = (value: string) =>
  value.includes("\\") ||
  Array.from(value).some((character) => character.charCodeAt(0) < 32);

export function safeReturnPath(value: string | null | undefined): string {
  // Reject network paths, backslashes and encoded equivalents before navigation.
  if (!value || !value.startsWith("/") || unsafePathCharacters(value))
    return "/discover";
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || unsafePathCharacters(decoded))
      return "/discover";
    const url = new URL(value, "http://aster.local");
    if (
      url.origin !== "http://aster.local" ||
      ["/sign-in", "/sign-up"].includes(url.pathname)
    )
      return "/discover";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/discover";
  }
}
