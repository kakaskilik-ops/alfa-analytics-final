import { useEffect, useState, type ReactNode } from "react";
import { supabase, signOutOwner } from "@/lib/supabase";
import Logo from "@/components/brand/Logo";

export default function OwnerKeyGate({ children }: { children: ReactNode }) {
  const [allowed, setAllowed] = useState(false),
    [checking, setChecking] = useState(true),
    [busy, setBusy] = useState(false);
  const [key, setKey] = useState(""),
    [website, setWebsite] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      setError("Подключение к сервису входа не настроено.");
      return;
    }
    let alive = true,
      generation = 0;
    const check = async (id: string | null) => {
      const current = ++generation;
      if (!alive) return;
      setAllowed(false);
      setChecking(Boolean(id));
      if (!id) return;
      try {
        const r = await supabase!.rpc("has_smm_owner_access");
        if (alive && current === generation) {
          setAllowed(!r.error && r.data === true);
          setChecking(false);
          if (r.error || r.data !== true)
            setError("Этот аккаунт не имеет доступа к личному кабинету.");
        }
      } catch {
        if (alive && current === generation) {
          setChecking(false);
          setError("Не удалось проверить доступ. Повторите вход.");
        }
      }
    };
    // Auth callbacks must not await another Supabase client call while its lock is held.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => {
        void check(session?.user.id ?? null);
      });
    });
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (generation === 0) void check(data.session?.user.id ?? null);
      })
      .catch(() => {
        if (alive) {
          setChecking(false);
          setError("Не удалось проверить сессию. Повторите вход.");
        }
      });
    return () => {
      alive = false;
      generation++;
      subscription.unsubscribe();
    };
  }, []);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setError("");
    const submitted = key;
    setKey("");
    try {
      const url = import.meta.env.VITE_SUPABASE_URL as string,
        apikey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const r = await fetch(
        url.replace(/\/$/, "") + "/functions/v1/owner-key-login",
        {
          method: "POST",
          signal: AbortSignal.timeout(45000),
          headers: { "Content-Type": "application/json", apikey },
          body: JSON.stringify({ key: submitted, website }),
        },
      );
      const data = await r.json();
      if (!r.ok)
        throw Error(
          typeof data.error === "string" ? data.error : "Не удалось войти.",
        );
      if (
        typeof data.session?.access_token !== "string" ||
        typeof data.session?.refresh_token !== "string"
      )
        throw Error("Сервис входа вернул неполный ответ.");
      const saved = await supabase.auth.setSession(data.session);
      if (saved.error)
        throw Error("Не удалось подтвердить сессию. Повторите вход.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Сервис входа недоступен.");
    } finally {
      setBusy(false);
    }
  }
  if (allowed)
    return (
      <>
        <div className="flex items-center justify-end border-b border-ink-800 bg-ink-950 px-4 py-2 text-xs text-ink-400">
          <button
            type="button"
            onClick={() => {
              setAllowed(false);
              void signOutOwner();
            }}
            className="hover:text-brand-400"
          >
            Выйти из личного кабинета
          </button>
        </div>
        {children}
      </>
    );
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-ink-800 bg-ink-900 p-6 md:p-8">
        <Logo />
        <h1 className="mt-8 text-xl font-semibold">
          Личный кабинет ALFA ANALYTICS
        </h1>
        <p className="my-3 text-sm text-ink-400">
          Введите личный ключ доступа.
        </p>
        <form onSubmit={(e) => void login(e)} className="space-y-4">
          <label className="block text-sm text-ink-300">
            Ключ доступа
            <input
              aria-label="Ключ доступа"
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              maxLength={256}
              required
              disabled={busy || checking || !supabase}
              className="mt-2 block w-full rounded-lg border border-ink-700 bg-ink-950 p-3 text-ink-100"
            />
          </label>
          <input
            aria-label="Website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="absolute -left-[10000px] h-px w-px"
            aria-hidden="true"
          />
          <button
            type="submit"
            disabled={busy || checking || !supabase || !key}
            className="w-full rounded-lg bg-brand-500 px-4 py-3 font-medium text-ink-950 disabled:opacity-40"
          >
            {checking ? "Проверка доступа…" : busy ? "Вход…" : "Войти"}
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-4 text-sm text-amber-300">
            {error}
          </p>
        )}
        <p className="mt-5 text-xs text-ink-500">
          Ключ не сохраняется в браузере. Не передавайте его другим людям.
        </p>
      </section>
    </main>
  );
}
