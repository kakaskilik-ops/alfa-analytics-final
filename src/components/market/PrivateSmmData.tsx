import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { METALS } from "@/data/metals";
import {
  parsePrivateSmmImport,
  type SmmImportRow,
} from "../../../shared/privateSmm";

export default function PrivateSmmData({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [rows, setRows] = useState<SmmImportRow[]>([]);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [metal, setMetal] = useState("all");
  const [tax, setTax] = useState("all");
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const change = (id: string | null) => {
      if (!alive) return;
      setUserId(id);
      setAllowed(false);
      setRows([]);
      setMessage("");
      setRevision((v) => v + 1);
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      change(session?.user.id ?? null),
    );
    void supabase.auth
      .getSession()
      .then(({ data }) => change(data.session?.user.id ?? null));
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!userId || !supabase) return;
    let alive = true;
    const load = async () => {
      const permission = await supabase!.rpc("has_smm_owner_access");
      if (!alive) return;
      if (permission.error || permission.data !== true) {
        setAllowed(false);
        setRows([]);
        setMessage("Приватный раздел доступен только аккаунту владельца.");
        return;
      }
      setAllowed(true);
      const result = await supabase!
        .from("private_smm_observations")
        .select(
          "series_id,metal_id,specification,purity,delivery_form,region,price_type,assessed_at,date_precision,currency,unit,tax_status,vat_rate,minimum,maximum,mean,source_url",
        )
        .order("assessed_at", { ascending: false })
        .limit(500);
      if (!alive) return;
      if (result.error) {
        setRows([]);
        setMessage("Не удалось загрузить приватные наблюдения.");
      } else {
        setRows(result.data as SmmImportRow[]);
        setMessage("");
      }
    };
    void load().catch(() => {
      if (alive) setMessage("Сервис приватных данных недоступен.");
    });
    return () => {
      alive = false;
    };
  }, [userId, revision]);
  async function login(verify = false) {
    if (!supabase || busy) return;
    setBusy(true);
    try {
      const result = verify
        ? await supabase.auth.verifyOtp({
            email: email.trim(),
            token: code.trim(),
            type: "email",
          })
        : await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: {
              shouldCreateUser: false,
              emailRedirectTo: location.origin + "/#smm",
            },
          });
      setMessage(
        result.error
          ? "Не удалось выполнить вход. Проверьте почту/код и разрешённый адрес возврата Supabase Auth."
          : verify
            ? "Вход выполнен."
            : "Письмо отправлено. Откройте ссылку входа или введите код, если он указан в письме. Адрес возврата должен быть alfammetal.ru.",
      );
    } catch {
      setMessage("Сервис входа недоступен.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File | undefined) {
    if (!file || !supabase || !allowed || !rights || busy) return;
    setBusy(true);
    try {
      if (file.size > 1000000) throw Error("Максимальный размер файла — 1 МБ.");
      const imported = parsePrivateSmmImport(JSON.parse(await file.text()));
      const { error } = await supabase.from("private_smm_observations").upsert(
        imported.map((r) => ({
          ...r,
          owner_id: userId,
          rights_attested: true,
        })),
        {
          onConflict: "owner_id,series_id,assessed_at,currency,unit,tax_status",
        },
      );
      if (error)
        throw Error(
          "Импорт отклонён. Проверьте доступ, формат и налоговые представления.",
        );
      setRevision((v) => v + 1);
      setMessage(
        `Сохранено наблюдений: ${imported.length}. Повторный импорт обновляет те же представления.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка импорта.");
    } finally {
      setBusy(false);
    }
  }
  if (compact && (!userId || !allowed)) return null;
  const latest = new Map<string, string>();
  for (const r of rows)
    if (!latest.has(r.series_id)) latest.set(r.series_id, r.assessed_at);
  const visible = rows.filter(
    (r) =>
      (!compact || r.assessed_at === latest.get(r.series_id)) &&
      (metal === "all" || r.metal_id === metal) &&
      (tax === "all" || r.tax_status === tax),
  );
  // Group all tax/currency/unit views of a series/date; do not count them as independent prices.
  const groups = new Map<string, SmmImportRow[]>();
  for (const r of visible) {
    const key = JSON.stringify([r.series_id, r.assessed_at]);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const number = (v: number | null) =>
    v === null
      ? "не опубликовано"
      : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 6 }).format(v);
  return (
    <section
      aria-label="SMM Market Data — приватно"
      className="mb-6 rounded-2xl border border-brand-500/30 bg-ink-900 p-4 md:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          SMM Market Data{" "}
          <span className="text-sm text-brand-400">· приватно</span>
        </h2>
        {userId && (
          <button
            type="button"
            onClick={() => {
              setRows([]);
              setAllowed(false);
              void supabase?.auth.signOut();
            }}
            className="text-sm text-ink-400"
          >
            Выйти
          </button>
        )}
      </div>
      <p className="my-3 text-xs text-ink-400">
        Только ваш аккаунт. Данные не включаются в публичные котировки, экспорт
        или контекст Groq. Автоматический сбор SMM не подключён; для него
        требуется официальный API и соответствующие права.
      </p>
      {!userId ? (
        !compact && (
          <div className="flex flex-wrap gap-3">
            <input
              aria-label="Почта владельца"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Электронная почта"
              className="max-w-full rounded border border-ink-700 bg-ink-950 p-2"
            />
            <button
              type="button"
              disabled={busy || !email}
              onClick={() => void login()}
              className="text-brand-400"
            >
              Получить письмо входа
            </button>
            <input
              aria-label="Код из письма"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Код, если указан в письме"
              className="max-w-full rounded border border-ink-700 bg-ink-950 p-2"
            />
            <button
              type="button"
              disabled={busy || !code || !email}
              onClick={() => void login(true)}
              className="text-brand-400"
            >
              Войти по коду
            </button>
          </div>
        )
      ) : allowed ? (
        <>
          {!compact && (
            <div className="mb-4 space-y-3 text-sm text-ink-300">
              <p>
                Импорт JSON: до 500 наблюдений / 1 МБ. Используйте
                документированный формат; валюты и НДС сохраняются без
                предположений и пересчётов.
              </p>
              <a
                href="/smm-import-format.json"
                target="_blank"
                rel="noreferrer"
                className="inline-block text-brand-400"
              >
                Формат импорта (без цен)
              </a>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={rights}
                  onChange={(e) => setRights(e.target.checked)}
                />
                <span>
                  Я законно получил эти данные и имею право хранить и
                  использовать их в своём личном кабинете.
                </span>
              </label>
              <input
                aria-label="Импорт SMM JSON"
                type="file"
                accept=".json,application/json"
                disabled={!rights || busy}
                onChange={(e) => {
                  void upload(e.target.files?.[0]);
                  e.target.value = "";
                }}
                className="block max-w-full text-xs"
              />
            </div>
          )}
          <div className="my-3 flex flex-wrap gap-3 text-xs">
            <label>
              Материал{" "}
              <select
                aria-label="Материал SMM"
                value={metal}
                onChange={(e) => setMetal(e.target.value)}
                className="max-w-full rounded bg-ink-950 p-2"
              >
                <option value="all">Все материалы</option>
                {METALS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nameRu} ({m.symbol})
                  </option>
                ))}
              </select>
            </label>
            <label>
              НДС{" "}
              <select
                aria-label="НДС SMM"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
                className="rounded bg-ink-950 p-2"
              >
                <option value="all">Все представления</option>
                <option value="excluded">Исключён</option>
                <option value="included">Включён</option>
                <option value="unknown">Не указан</option>
              </select>
            </label>
          </div>
          {!rows.length && (
            <p className="text-sm text-ink-400">
              Данных SMM пока нет. Импортируйте законно полученный файл в
              приватном разделе; тестовые цены не загружены.
            </p>
          )}
          {rows.length > 0 && !visible.length && (
            <p className="text-sm text-ink-400">
              Нет наблюдений для выбранного фильтра.
            </p>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            {[...groups.entries()].map(([key, views]) => (
              <article
                key={key}
                className="min-w-0 rounded-xl border border-ink-700 p-4 text-xs text-ink-300"
              >
                <h3 className="font-semibold text-ink-100">
                  {METALS.find((m) => m.id === views[0].metal_id)?.nameRu} ·{" "}
                  {views[0].specification}
                </h3>
                <p className="mt-1 break-words">
                  Серия: {views[0].series_id} · {views[0].assessed_at} ·{" "}
                  {views[0].region}
                </p>
                <p>
                  {views[0].purity} · {views[0].delivery_form} ·{" "}
                  {views[0].price_type}
                </p>
                {views.map((r) => (
                  <div
                    key={r.currency + r.unit + r.tax_status}
                    className="mt-3 border-t border-ink-800 pt-3"
                  >
                    <p>
                      {r.minimum !== null
                        ? `От ${number(r.minimum)} до ${number(r.maximum)}`
                        : `Цена: ${number(r.mean)}`}{" "}
                      {r.currency}/{r.unit}
                    </p>
                    {r.minimum !== null && (
                      <p>
                        Средняя: {number(r.mean)} {r.currency}/{r.unit}
                      </p>
                    )}
                    <p>
                      {r.tax_status === "excluded"
                        ? "НДС исключён"
                        : r.tax_status === "included"
                          ? "НДС включён"
                          : "НДС не указан"}
                      {r.vat_rate !== null
                        ? ` · ставка ${number(r.vat_rate * 100)}%`
                        : " · ставка не подтверждена"}
                    </p>
                    <a
                      href={r.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-brand-400"
                    >
                      Источник SMM ↗
                    </a>
                  </div>
                ))}
                <p className="mt-2 text-ink-500">
                  Представления одной даты и серии, не независимые источники.
                  Показано до 500 последних записей без пересчёта валют.
                </p>
              </article>
            ))}
          </div>
          {compact && (
            <a href="#smm" className="mt-3 inline-block text-sm text-brand-400">
              Открыть личный кабинет и импорт →
            </a>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-400">Проверка доступа владельца…</p>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-ink-300">
          {message}
        </p>
      )}
    </section>
  );
}
