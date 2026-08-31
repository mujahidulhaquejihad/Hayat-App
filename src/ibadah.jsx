import { useEffect, useMemo, useRef, useState } from "react";
import {
  compassDelta,
  fetchHijriMonth,
  fetchQuranPage,
  fireNotify,
  HIJRI_BN,
  playChime,
  qiblaBearing,
  shiftHijri,
  unlockAudio,
} from "./lib";
import { searchDuas } from "./duas";
import { NAMAZ_SURAHS, PRAYERS, RECITES, STEPS } from "./namaz";

export function IbadahHub({
  pane,
  onPane,
  profile,
  locBusy,
  onLocate,
  quranPage,
  onQuranPage,
  childrenTimes,
  prayer,
}) {
  const title =
    pane === "times"
      ? "Namaz"
      : pane === "quran"
        ? "Recite"
        : pane === "qibla"
          ? "Qibla"
          : pane === "hijri"
            ? "Hijri"
            : "Dua";
  return (
    <main className="page namaz-page">
      <header className="top">
        <div>
          <p className="kicker">عبادة</p>
          <h1>{title}</h1>
        </div>
        <button className="chip ghost" disabled={locBusy} onClick={onLocate}>
          {profile.city || "GPS"}
        </button>
      </header>
      <div className="seg ibadah-seg">
        {[
          ["times", "Namaz"],
          ["quran", "Recite"],
          ["qibla", "Qibla"],
          ["dua", "Dua"],
          ["hijri", "Hijri"],
        ].map(([id, label]) => (
          <button key={id} className={pane === id ? "on" : ""} onClick={() => onPane(id)}>
            {label}
          </button>
        ))}
      </div>
      {pane === "times" && childrenTimes}
      {pane === "quran" && (
        <QuranReader page={quranPage} onPage={onQuranPage} />
      )}
      {pane === "qibla" && (
        <QiblaFinder profile={profile} onLocate={onLocate} locBusy={locBusy} />
      )}
      {pane === "dua" && <DuaSearch />}
      {pane === "hijri" && (
        <HijriCalendar profile={profile} prayer={prayer} onLocate={onLocate} locBusy={locBusy} />
      )}
    </main>
  );
}

function ReciteBlock({ id, extra }) {
  const r = extra || RECITES[id];
  if (!r) return null;
  return (
    <article className="recite-block">
      <p className="kicker">{r.bnTitle || r.title}</p>
      {r.title && r.bnTitle && <h3>{r.title}{r.no ? ` · ${r.no}` : ""}</h3>}
      {r.need && <p className="tiny">{r.needBn ? `${r.needBn} ${r.need}` : r.need}</p>}
      <p className="ayah-ar" dir="rtl" lang="ar">
        {r.ar}
      </p>
      {r.pron && <p className="ayah-pron">{r.pron}</p>}
      {r.bn && <p className="ayah-bn">{r.bn}</p>}
    </article>
  );
}

export function NamazHowTo({ name, clock, onBack }) {
  const p = PRAYERS[name];
  if (!p) return null;
  return (
    <>
      <button type="button" className="textish" onClick={onBack}>
        ← All salah
      </button>
      <header className="guide-head">
        <p className="kicker">{p.bn}</p>
        <h2>{name}</h2>
        {clock && <p className="muted">{clock}</p>}
      </header>
      <ul className="rakat-row">
        {p.units.map((u, i) => (
          <li key={`${u.label}-${i}`}>
            <b>{u.count}</b>
            <span>{u.label}</span>
            <em>{u.bn}</em>
          </li>
        ))}
      </ul>
      <p className="flag">
        {p.voiceBn} {p.voice}
      </p>
      <h3>How to pray</h3>
      <ol className="how-steps">
        {STEPS.map((s) => (
          <li key={s.title}>
            <b>{s.title}</b>
            <p>{s.bn}</p>
            <p className="muted">{s.en}</p>
            {s.ar && (
              <p className="ayah-ar compact" dir="rtl" lang="ar">
                {s.ar}
              </p>
            )}
            {s.pron && <p className="ayah-pron">{s.pron}</p>}
          </li>
        ))}
      </ol>
      {p.note && <p className="tiny">{p.note}</p>}
      <h3>What to recite</h3>
      <p className="tiny">Arabic, then how to say it, then Bangla.</p>
      {["sana", "audhu", "basmala", "fatiha", "ruku", "qawmah", "sujud", "jalsa", "tashahhud", "durood", "salam"].map(
        (id) => (
          <ReciteBlock key={id} id={id} />
        )
      )}
      <h3>Short surahs after Fatiha</h3>
      <p className="tiny">Memorise Al-Ikhlas first. Open Recite → Namaz surahs to practise.</p>
      <ul className="namaz-surah-mini">
        {NAMAZ_SURAHS.filter((s) => s.id !== "fatiha").slice(0, 6).map((s) => (
          <li key={s.id}>
            <b>{s.bnTitle}</b>
            <span>{s.title}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function QuranReader({ page, onPage }) {
  const [view, setView] = useState("mushaf");
  const [openSurah, setOpenSurah] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(10 * 60);
  const [running, setRunning] = useState(false);
  const tick = useRef(null);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    setErr("");
    fetchQuranPage(page)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setErr("Could not load this page. Check the internet.");
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [page]);

  useEffect(() => {
    if (!running) return;
    tick.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          setRunning(false);
          playChime("meal");
          fireNotify({
            title: "10 min Quran",
            body: "Barakallahu feek. Come back tomorrow — or turn the page.",
            tag: "quran",
          });
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick.current);
  }, [running]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <>
      <div className="seg">
        <button className={view === "mushaf" ? "on" : ""} onClick={() => setView("mushaf")}>
          Mushaf
        </button>
        <button className={view === "namaz" ? "on" : ""} onClick={() => setView("namaz")}>
          Namaz surahs
        </button>
      </div>

      {view === "namaz" && (
        <>
          <p className="lede">
            These are the surahs you need for salah. Fatiha every rakat, then any one short
            surah. They stay on the phone — no internet needed.
          </p>
          {NAMAZ_SURAHS.map((s) => (
            <button
              type="button"
              key={s.id}
              className={`surah-pick ${openSurah === s.id ? "on" : ""}`}
              onClick={() => setOpenSurah(openSurah === s.id ? null : s.id)}
            >
              <span className="tiny">
                {s.no} · p.{s.page}
              </span>
              <b>{s.bnTitle}</b>
              <em>{s.title}</em>
            </button>
          ))}
          {openSurah && (
            <>
              <ReciteBlock extra={NAMAZ_SURAHS.find((s) => s.id === openSurah)} />
              <button
                className="btn ghost"
                onClick={() => {
                  const s = NAMAZ_SURAHS.find((x) => x.id === openSurah);
                  if (s) {
                    onPage(s.page);
                    setView("mushaf");
                  }
                }}
              >
                Open this page in the Mushaf
              </button>
            </>
          )}
        </>
      )}

      {view === "mushaf" && (
        <>
          <div className="quran-bar">
            <div>
              <p className="kicker gold">১০ মিনিট তিলাওয়াত</p>
              <strong className="timer">{mm}:{ss}</strong>
            </div>
            <button
              className="btn primary slim"
              onClick={() => {
                unlockAudio();
                if (left === 0) setLeft(10 * 60);
                setRunning((r) => !r);
              }}
            >
              {running ? "Pause" : left === 0 ? "Again" : "Start 10 min"}
            </button>
          </div>
          <p className="flag">
            Last read: page {page} / 604{data?.surah ? ` · ${data.surah}` : ""}. Turning
            pages saves your place.
          </p>
          <div
            className="quran-progress"
            role="progressbar"
            aria-valuenow={page}
            aria-valuemin={1}
            aria-valuemax={604}
          >
            <i style={{ width: `${(page / 604) * 100}%` }} />
          </div>
          <div className="row">
            <button className="btn ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
              Prev
            </button>
            <button className="btn ghost" disabled={page >= 604} onClick={() => onPage(page + 1)}>
              Next page
            </button>
          </div>
          {busy && <p className="muted">Loading ayahs…</p>}
          {err && <p className="flag alert">{err}</p>}
          {data?.ayahs.map((a) => (
            <article key={a.key} className="ayah-read">
              <p className="ayah-meta">
                {a.surah} {a.surahNo}:{a.ayah}
              </p>
              <p className="ayah-ar" dir="rtl" lang="ar">
                {a.ar}
              </p>
              {a.pron && <p className="ayah-pron">{a.pron}</p>}
              <p className="ayah-bn">{a.bn}</p>
            </article>
          ))}
        </>
      )}
    </>
  );
}

function QiblaFinder({ profile, onLocate, locBusy }) {
  const [heading, setHeading] = useState(null);
  const [needTap, setNeedTap] = useState(false);
  const lat = profile.lat;
  const lng = profile.lng;
  const qibla = lat != null && lng != null ? (qiblaBearing(lat, lng) + 360) % 360 : null;
  const delta = heading != null && qibla != null ? compassDelta(heading, qibla) : null;
  const aligned = delta != null && Math.abs(delta) < 8;

  useEffect(() => {
    function onOri(e) {
      const h =
        typeof e.webkitCompassHeading === "number"
          ? e.webkitCompassHeading
          : e.absolute === true && typeof e.alpha === "number"
            ? (360 - e.alpha) % 360
            : typeof e.alpha === "number"
              ? (360 - e.alpha) % 360
              : null;
      if (h != null) setHeading(h);
    }
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      setNeedTap(true);
    } else {
      window.addEventListener("deviceorientationabsolute", onOri, true);
      window.addEventListener("deviceorientation", onOri, true);
    }
    return () => {
      window.removeEventListener("deviceorientationabsolute", onOri, true);
      window.removeEventListener("deviceorientation", onOri, true);
    };
  }, []);

  async function enableCompass() {
    try {
      const DOE = window.DeviceOrientationEvent;
      if (DOE && typeof DOE.requestPermission === "function") {
        const p = await DOE.requestPermission();
        if (p !== "granted") return;
      }
      setNeedTap(false);
      const onOri = (e) => {
        const h =
          typeof e.webkitCompassHeading === "number"
            ? e.webkitCompassHeading
            : typeof e.alpha === "number"
              ? (360 - e.alpha) % 360
              : null;
        if (h != null) setHeading(h);
      };
      window.addEventListener("deviceorientationabsolute", onOri, true);
      window.addEventListener("deviceorientation", onOri, true);
    } catch {
      setNeedTap(false);
    }
  }

  const needle = qibla == null ? 0 : heading == null ? qibla : qibla - heading;

  return (
    <>
      <p className="lede">
        Point the top of your phone toward the Kaaba. GPS sets the direction;
        the compass tells you when to stop turning.
      </p>
      {lat == null && (
        <button className="btn primary" disabled={locBusy} onClick={onLocate}>
          {locBusy ? "Finding you…" : "Use GPS for Qibla"}
        </button>
      )}
      {needTap && (
        <button className="btn primary" onClick={enableCompass}>
          Enable compass
        </button>
      )}
      <div className={`qibla-wrap ${aligned ? "ok" : ""}`}>
        <div className="qibla-dial">
          <span className="qibla-n">N</span>
          <div className="qibla-needle" style={{ transform: `rotate(${needle}deg)` }}>
            <i />
          </div>
        </div>
        <p className="qibla-deg">
          {qibla != null ? `${Math.round(qibla)}°` : "—"} from north
        </p>
        {aligned ? (
          <p className="flag">You are facing Qibla.</p>
        ) : delta != null ? (
          <p className="muted">
            Turn {Math.abs(Math.round(delta))}° {delta > 0 ? "right" : "left"}
          </p>
        ) : heading == null ? (
          <p className="tiny">
            On a phone, allow motion sensors. Desktop shows the bearing from
            north — face that with a real compass.
          </p>
        ) : null}
      </div>
      <button className="btn ghost" disabled={locBusy} onClick={onLocate}>
        Recalculate from GPS
      </button>
    </>
  );
}

function DuaSearch() {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    if (!q.trim()) return searchDuas("").slice(0, 8);
    return searchDuas(q);
  }, [q]);
  const chips = ["eat", "sleep", "anxiety", "parents", "travel", "forgive", "sick", "exam"];

  return (
    <>
      <input
        className="dua-search"
        value={q}
        placeholder="Search: sleep, খাওয়া, রাগ, exam, rain…"
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="chips">
        {chips.map((c) => (
          <button key={c} className="chip ghost" onClick={() => setQ(c)}>
            {c}
          </button>
        ))}
      </div>
      {hits.length === 0 && (
        <article className="card">
          <h3>Ask in your own words</h3>
          <p className="muted">
            No tagged dua matched. You may still ask Allah in Bangla or English —
            He hears every tongue. Try the general dua below, or search
            “anything”.
          </p>
        </article>
      )}
      {(hits.length ? hits : searchDuas("anything")).map((d) => (
        <article key={d.id} className="dua-card">
          <p className="kicker">{d.bnTitle}</p>
          <h3>{d.title}</h3>
          <p className="ayah-ar" dir="rtl" lang="ar">
            {d.ar}
          </p>
          <p className="ayah-bn">{d.bn}</p>
          <p className="muted">{d.en}</p>
        </article>
      ))}
    </>
  );
}

const WEEK_BN = ["শনি", "রবি", "সোম", "মঙ্গল", "বুধ", "বৃহ", "শুক্র"];

function HijriCalendar({ profile, prayer, onLocate, locBusy }) {
  const fromPrayer = prayer?.hijri
    ? { month: Number(prayer.hijri.month.number), year: Number(prayer.hijri.year) }
    : { month: 9, year: 1447 };
  const [cursor, setCursor] = useState(fromPrayer);
  const [cal, setCal] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(null);

  const inited = useRef(false);
  useEffect(() => {
    if (!prayer?.hijri || inited.current) return;
    inited.current = true;
    setCursor({ month: Number(prayer.hijri.month.number), year: Number(prayer.hijri.year) });
  }, [prayer?.hijri]);

  useEffect(() => {
    if (profile.lat == null || profile.lng == null) return;
    let alive = true;
    setBusy(true);
    setErr("");
    fetchHijriMonth({
      lat: profile.lat,
      lng: profile.lng,
      month: cursor.month,
      year: cursor.year,
      method: profile.prayerMethod,
    })
      .then((d) => {
        if (!alive) return;
        setCal(d);
        const todayN = Number(prayer?.hijri?.day);
        const hit =
          d.month === Number(prayer?.hijri?.month?.number) && d.year === Number(prayer?.hijri?.year)
            ? d.days.find((x) => x.hijriDay === todayN)
            : d.days[0];
        setPicked(hit || d.days[0]);
      })
      .catch(() => {
        if (alive) setErr("Could not load the Hijri month. Check GPS / network.");
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [profile.lat, profile.lng, profile.prayerMethod, cursor.month, cursor.year]);

  const blanks = cal?.days?.[0] ? Array.from({ length: cal.days[0].pad }, () => null) : [];
  const todayDay =
    cal &&
    Number(prayer?.hijri?.month?.number) === cal.month &&
    Number(prayer?.hijri?.year) === cal.year
      ? Number(prayer.hijri.day)
      : null;

  return (
    <>
      <p className="lede">
        Islamic month by your location. In Ramadan, each day shows সাহরি (last bite)
        and ইফতার (Maghrib).
      </p>
      {profile.lat == null && (
        <button className="btn primary" disabled={locBusy} onClick={onLocate}>
          {locBusy ? "Finding you…" : "Use GPS for the calendar"}
        </button>
      )}
      <div className="hijri-nav">
        <button className="btn ghost slim" onClick={() => setCursor((c) => shiftHijri(c.month, c.year, -1))}>
          ‹
        </button>
        <div>
          <strong>
            {HIJRI_BN[cursor.month]} {cursor.year}
          </strong>
          <p className="tiny">{cal?.isRamadan ? "রমজান · fasting month" : "Ramadan is month 9"}</p>
        </div>
        <button className="btn ghost slim" onClick={() => setCursor((c) => shiftHijri(c.month, c.year, 1))}>
          ›
        </button>
      </div>
      {cursor.month !== 9 && (
        <button
          className="btn ghost"
          onClick={() => setCursor((c) => ({ month: 9, year: c.month > 9 ? c.year + 1 : c.year }))}
        >
          Jump to Ramadan
        </button>
      )}
      {busy && <p className="muted">Loading month…</p>}
      {err && <p className="flag alert">{err}</p>}
      {cal && (
        <>
          <div className="hijri-grid">
            {WEEK_BN.map((w) => (
              <span key={w} className="hijri-wd">
                {w}
              </span>
            ))}
            {blanks.map((_, i) => (
              <span key={`b${i}`} className="hijri-cell empty" />
            ))}
            {cal.days.map((d) => (
              <button
                key={d.hijriDay}
                className={`hijri-cell ${picked?.hijriDay === d.hijriDay ? "on" : ""} ${todayDay === d.hijriDay ? "today" : ""} ${cal.isRamadan ? "ramadan" : ""}`}
                onClick={() => setPicked(d)}
              >
                <b>{d.hijriDay}</b>
                {cal.isRamadan && <em>{d.iftar}</em>}
              </button>
            ))}
          </div>
          {picked && (
            <article className="card ramadan-day">
              <p className="kicker">
                {HIJRI_BN[picked.hijriMonth]} {picked.hijriDay} · {picked.gregorian}
              </p>
              <h3>{cal.isRamadan ? "Suhoor & Iftar" : picked.holidays[0] || "Day times"}</h3>
              {cal.isRamadan ? (
                <ul className="ramadan-times">
                  <li>
                    <span>সাহরি শুরু</span>
                    <b>{picked.suhoorStart}</b>
                  </li>
                  <li>
                    <span>সাহরি শেষ · ইমসাক</span>
                    <b>{picked.suhoorEnd}</b>
                  </li>
                  <li>
                    <span>ফজর</span>
                    <b>{picked.fajr}</b>
                  </li>
                  <li className="iftar">
                    <span>ইফতার · মাগরিব</span>
                    <b>{picked.iftar}</b>
                  </li>
                </ul>
              ) : (
                <ul className="ramadan-times">
                  <li>
                    <span>ফজর</span>
                    <b>{picked.fajr}</b>
                  </li>
                  <li>
                    <span>মাগরিব</span>
                    <b>{picked.maghrib}</b>
                  </li>
                </ul>
              )}
              {picked.holidays.length > 0 && <p className="flag">{picked.holidays.join(" · ")}</p>}
              {cal.isRamadan && (
                <p className="tiny">
                  Eat from Maghrib until Imsak. Fast from Imsak until Maghrib.
                  Suhoor alarm fires 45 minutes before Imsak.
                </p>
              )}
            </article>
          )}
        </>
      )}
    </>
  );
}
