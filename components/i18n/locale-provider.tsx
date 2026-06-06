"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { defaultLocale, dictionary, isLocale, type Dictionary, type Locale } from "@/lib/i18n";

type LocaleContextValue = {
  locale: Locale;
  t: Dictionary;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale = defaultLocale,
  children,
}: {
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    const saved = window.localStorage.getItem("marketpilot-locale");
    if (isLocale(saved)) setLocaleState(saved);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      t: dictionary[locale],
      setLocale(nextLocale) {
        setLocaleState(nextLocale);
        window.localStorage.setItem("marketpilot-locale", nextLocale);
        document.cookie = `marketpilot-locale=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
      },
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("useLocale must be used inside LocaleProvider");
  }
  return value;
}
