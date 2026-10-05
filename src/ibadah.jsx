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
  tr,
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
  quranToday,
  khatams,
  onKhatam,
  onProfile,
  tasbihToday,
  onTasbih,
  childrenTimes,
  prayer,
}) {
  const panes = [
    ["times", tr("Namaz", "নামাজ")],
    ["quran", tr("Recite", "তিলাওয়াত")],
    ["tasbih", tr("Tasbih", "তাসবিহ")],
    ["qibla", tr("Qibla", "কিবলা")],
    ["dua", tr("Dua", "দোয়া")],
    ["hijri", tr("Hijri", "হিজরি")],
  ];
  const title = (panes.find(([id]) => id === pane) || panes[0])[1];
  return (
    <main className="page namaz-page">
      <header className="top">
        <div>
          <p className="kicker">عبادة</p>
          <h1>{title}</h1>
        </div>
        <button className="chip ghost" disabled={locBusy} onClick={onLocate}>
          {profile.city || tr("GPS", "জিপিএস")}
        </button>
      </header>
      <div className="seg ibadah-seg">
        {panes.map(([id, label]) => (
          <button key={id} className={pane === id ? "on" : ""} onClick={() => onPane(id)}>
            {label}
          </button>
        ))}
      </div>
      {pane === "times" && childrenTimes}
      {pane === "quran" && (
        <QuranReader
          page={quranPage}
          onPage={onQuranPage}
          today={quranToday}
          goal={profile.quranGoal || 4}
          onGoal={(g) => onProfile({ quranGoal: g })}
          khatams={khatams}
          onKhatam={onKhatam}
        />
      )}
      {pane === "tasbih" && <Tasbih today={tasbihToday} onToday={onTasbih} />}
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

const DHIKR = [
  { ar: "سُبْحَانَ ٱللَّٰهِ", pron: "SubhanAllah", bn: "সুবহানাল্লাহ", n: 33 },
  { ar: "ٱلْحَمْدُ لِلَّٰهِ", pron: "Alhamdulillah", bn: "আলহামদুলিল্লাহ", n: 33 },
  { ar: "ٱللَّٰهُ أَكْبَرُ", pron: "Allahu Akbar", bn: "আল্লাহু আকবার", n: 34 },
];

function Tasbih({ today, onToday }) {
  const [idx, setIdx] = useState(0);
  const [count, setCount] = useState(0);
  const [doneSet, setDoneSet] = useState(false);
  const d = DHIKR[idx];

  function tap() {
    onToday(today + 1);
    setDoneSet(false);
    const next = count + 1;
    if (next < d.n) {
      setCount(next);
      navigator.vibrate?.(15);
      return;
    }
    setCount(0);
    if (idx < DHIKR.length - 1) {
      setIdx(idx + 1);
      navigator.vibrate?.(200);
    } else {
      setIdx(0);
      setDoneSet(true);
      navigator.vibrate?.([200, 80, 200]);
    }
  }

  return (
    <>
      <p className="lede">
        {tr(
          "After each salah: 33 SubhanAllah, 33 Alhamdulillah, 34 Allahu Akbar. Tap anywhere on the circle — it moves on by itself.",
          "প্রতি নামাজের পর: ৩৩ বার সুবহানাল্লাহ, ৩৩ বার আলহামদুলিল্লাহ, ৩৪ বার আল্লাহু আকবার। বৃত্তে চাপো — নিজে থেকেই পরেরটায় যাবে।"
        )}
      </p>
      <div className="chips">
        {DHIKR.map((x, i) => (
          <button
            key={x.pron}
            className={`chip ${i === idx ? "" : "ghost"}`}
            onClick={() => {
              setIdx(i);
              setCount(0);
            }}
          >
            {tr(x.pron, x.bn)}
          </button>
        ))}
      </div>
      <button className="tasbih-tap" onClick={tap} aria-label={tr(`Count ${d.pron}`, `${d.bn} গণনা`)}>
        <span className="ayah-ar" dir="rtl" lang="ar">
          {d.ar}
        </span>
        <strong>{count}</strong>
        <em>/ {d.n}</em>
      </button>
      {doneSet && <p className="flag">{tr("Set complete. Barakallahu feek.", "সেট সম্পূর্ণ। বারাকাল্লাহু ফিক।")}</p>}
      <div className="card-h">
        <span>{tr(`Today: ${today}`, `আজ: ${today}`)}</span>
        <button
          className="textish"
          onClick={() => {
            setIdx(0);
            setCount(0);
            setDoneSet(false);
          }}
        >
          {tr("Reset set", "সেট রিসেট")}
        </button>
      </div>
    </>
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
        ← {tr("All salah", "সব নামাজ")}
      </button>
      <header className="guide-head">
        <p className="kicker">{p.bn}</p>
        <h2>{tr(name, p.bn)}</h2>
        {clock && <p className="muted">{clock}</p>}
      </header>
      <ul className="rakat-row">
        {p.units.map((u, i) => (
          <li key={`${u.label}-${i}`}>
            <b>{u.count}</b>
            <span>{tr(u.label, u.bn)}</span>
            {tr(true, false) && <em>{u.bn}</em>}
          </li>
        ))}
      </ul>
      <p className="flag">
        {p.voiceBn} {tr(p.voice, "")}
      </p>
      <h3>{tr("How to pray", "কীভাবে পড়বে")}</h3>
      <ol className="how-steps">
        {STEPS.map((s) => (
          <li key={s.title}>
            <b>{s.title}</b>
            <p>{s.bn}</p>
            {tr(true, false) && <p className="muted">{s.en}</p>}
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
      <h3>{tr("What to recite", "কী পড়বে")}</h3>
      <p className="tiny">{tr("Arabic, then how to say it, then Bangla.", "আরবি, তারপর উচ্চারণ, তারপর বাংলা অর্থ।")}</p>
      {["sana", "audhu", "basmala", "fatiha", "ruku", "qawmah", "sujud", "jalsa", "tashahhud", "durood", "salam"].map(
        (id) => (
          <ReciteBlock key={id} id={id} />
        )
      )}
      <h3>{tr("Short surahs after Fatiha", "ফাতিহার পর ছোট সূরা")}</h3>
      <p className="tiny">
        {tr(
          "Memorise Al-Ikhlas first. Open Recite → Namaz surahs to practise.",
          "প্রথমে সূরা ইখলাস মুখস্থ করো। অনুশীলনের জন্য তিলাওয়াত → নামাজের সূরা খোলো।"
        )}
      </p>
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

function QuranReader({ page, onPage, today, goal, onGoal, khatams, onKhatam }) {
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
        if (alive) setErr(tr("Could not load this page. Check the internet.", "পৃষ্ঠাটি লোড হয়নি। ইন্টারনেট দেখো।"));
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
            title: tr("10 min Quran", "১০ মিনিট কুরআন"),
            body: tr("Barakallahu feek. Come back tomorrow — or turn the page.", "বারাকাল্লাহু ফিক। কাল আবার এসো — অথবা পরের পৃষ্ঠা পড়ো।"),
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
          {tr("Mushaf", "মুসহাফ")}
        </button>
        <button className={view === "namaz" ? "on" : ""} onClick={() => setView("namaz")}>
          {tr("Namaz surahs", "নামাজের সূরা")}
        </button>
      </div>

      {view === "namaz" && (
        <>
          <p className="lede">
            {tr(
              "These are the surahs you need for salah. Fatiha every rakat, then any one short surah. They stay on the phone — no internet needed.",
              "নামাজের জন্য এই সূরাগুলো লাগে। প্রতি রাকাতে ফাতিহা, তারপর যেকোনো একটি ছোট সূরা। এগুলো ফোনেই থাকে — ইন্টারনেট লাগে না।"
            )}
          </p>
          {NAMAZ_SURAHS.map((s) => (
            <button
              type="button"
              key={s.id}
              className={`surah-pick ${openSurah === s.id ? "on" : ""}`}
              onClick={() => setOpenSurah(openSurah === s.id ? null : s.id)}
            >
              <span className="tiny">
                {s.no} · {tr("p.", "পৃ.")}{s.page}
              </span>
              <b>{s.bnTitle}</b>
              <em>{tr(s.title, "")}</em>
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
                {tr("Open this page in the Mushaf", "মুসহাফে এই পৃষ্ঠা খোলো")}
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
              {running ? tr("Pause", "থামাও") : left === 0 ? tr("Again", "আবার") : tr("Start 10 min", "১০ মিনিট শুরু")}
            </button>
          </div>
          <section className="card stack">
            <div className="card-h">
              <h3>{tr("Daily goal", "দৈনিক লক্ষ্য")}</h3>
              <span>
                {Math.min(today, goal)}/{goal} {tr("pages today", "পৃষ্ঠা আজ")}
                {today >= goal && " ✓"}
              </span>
            </div>
            <div className="quran-progress" aria-hidden>
              <i style={{ width: `${Math.min(100, (today / goal) * 100)}%` }} />
            </div>
            <label>
              {tr("Pages per day", "দিনে কত পৃষ্ঠা")}
              <select value={goal} onChange={(e) => onGoal(Number(e.target.value))}>
                {[1, 2, 4, 5, 10, 20].map((g) => (
                  <option key={g} value={g}>
                    {g} {tr("pages", "পৃষ্ঠা")} — {tr("khatam in", "খতম")} ~{Math.ceil(604 / g)} {tr("days", "দিনে")}
                  </option>
                ))}
              </select>
            </label>
            <p className="tiny">
              {tr(
                `Khatam: page ${page} of 604 (${Math.round((page / 604) * 100)}%). At ${goal}/day you finish in ~${Math.ceil((604 - page) / goal)} days.${khatams ? ` Completed ${khatams} time${khatams > 1 ? "s" : ""}.` : ""}`,
                `খতম: ৬০৪ এর ${page} পৃষ্ঠা (${Math.round((page / 604) * 100)}%)। দিনে ${goal} পৃষ্ঠায় ~${Math.ceil((604 - page) / goal)} দিনে শেষ।${khatams ? ` ${khatams} বার খতম সম্পন্ন।` : ""}`
              )}
            </p>
          </section>
          <p className="flag">
            {tr("Last read", "শেষ পড়া")}: {tr("page", "পৃষ্ঠা")} {page} / 604{data?.surah ? ` · ${data.surah}` : ""}.{" "}
            {tr("Next page counts toward today's goal.", "পরের পৃষ্ঠা চাপলে আজকের লক্ষ্যে গণনা হয়।")}
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
              {tr("Prev", "আগের")}
            </button>
            {page >= 604 ? (
              <button className="btn primary" onClick={onKhatam}>
                {tr("Khatam done — start again", "খতম শেষ — আবার শুরু")}
              </button>
            ) : (
              <button className="btn ghost" onClick={() => onPage(page + 1)}>
                {tr("Next page", "পরের পৃষ্ঠা")}
              </button>
            )}
          </div>
          {busy && <p className="muted">{tr("Loading ayahs…", "আয়াত লোড হচ্ছে…")}</p>}
          {err && <p className="flag alert">{err}</p>}
          {data?.ayahs.map((a) => (
            <article key={a.key} className="ayah-read">
              <p className="ayah-meta">
                {tr(a.surah, a.surahBn)} {a.surahNo}:{a.ayah}
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
        {tr(
          "Point the top of your phone toward the Kaaba. GPS sets the direction; the compass tells you when to stop turning.",
          "ফোনের উপরের দিক কাবার দিকে ধরো। জিপিএস দিক ঠিক করে; কম্পাস বলে কখন থামতে হবে।"
        )}
      </p>
      {lat == null && (
        <button className="btn primary" disabled={locBusy} onClick={onLocate}>
          {locBusy ? tr("Finding you…", "খুঁজছি…") : tr("Use GPS for Qibla", "কিবলার জন্য জিপিএস নাও")}
        </button>
      )}
      {needTap && (
        <button className="btn primary" onClick={enableCompass}>
          {tr("Enable compass", "কম্পাস চালু করো")}
        </button>
      )}
      <div className={`qibla-wrap ${aligned ? "ok" : ""}`}>
        <div className="qibla-dial">
          <span className="qibla-n">{tr("N", "উ")}</span>
          <div className="qibla-needle" style={{ transform: `rotate(${needle}deg)` }}>
            <i />
          </div>
        </div>
        <p className="qibla-deg">
          {qibla != null ? `${Math.round(qibla)}°` : "—"} {tr("from north", "উত্তর থেকে")}
        </p>
        {aligned ? (
          <p className="flag">{tr("You are facing Qibla.", "তুমি কিবলামুখী।")}</p>
        ) : delta != null ? (
          <p className="muted">
            {tr(
              `Turn ${Math.abs(Math.round(delta))}° ${delta > 0 ? "right" : "left"}`,
              `${delta > 0 ? "ডানে" : "বামে"} ${Math.abs(Math.round(delta))}° ঘোরো`
            )}
          </p>
        ) : heading == null ? (
          <p className="tiny">
            {tr(
              "On a phone, allow motion sensors. Desktop shows the bearing from north — face that with a real compass.",
              "ফোনে মোশন সেন্সর চালু করো। কম্পিউটারে উত্তর থেকে কোণ দেখায় — আসল কম্পাস দিয়ে সেদিকে ফেরো।"
            )}
          </p>
        ) : null}
      </div>
      <button className="btn ghost" disabled={locBusy} onClick={onLocate}>
        {tr("Recalculate from GPS", "জিপিএস দিয়ে আবার হিসাব")}
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
  const chips = tr(
    ["eat", "sleep", "anxiety", "parents", "travel", "forgive", "sick", "exam"],
    ["খাওয়া", "ঘুম", "দুশ্চিন্তা", "বাবা", "সফর", "ক্ষমা", "অসুখ", "পরীক্ষা"]
  );

  return (
    <>
      <input
        className="dua-search"
        value={q}
        placeholder={tr("Search: sleep, খাওয়া, রাগ, exam, rain…", "খুঁজুন: ঘুম, খাওয়া, রাগ, পরীক্ষা, বৃষ্টি…")}
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
          <h3>{tr("Ask in your own words", "নিজের ভাষায় চাও")}</h3>
          <p className="muted">
            {tr(
              "No tagged dua matched. You may still ask Allah in Bangla or English — He hears every tongue. Try the general dua below, or search “anything”.",
              "মিলে যাওয়া দোয়া পাওয়া যায়নি। তবু বাংলায় আল্লাহর কাছে চাও — তিনি সব ভাষা শোনেন। নিচের সাধারণ দোয়াটি পড়ো।"
            )}
          </p>
        </article>
      )}
      {(hits.length ? hits : searchDuas("anything")).map((d) => (
        <article key={d.id} className="dua-card">
          <p className="kicker">{d.bnTitle}</p>
          <h3>{tr(d.title, d.bnTitle)}</h3>
          <p className="ayah-ar" dir="rtl" lang="ar">
            {d.ar}
          </p>
          <p className="ayah-bn">{d.bn}</p>
          {tr(true, false) && <p className="muted">{d.en}</p>}
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
        if (alive) setErr(tr("Could not load the Hijri month. Check GPS / network.", "হিজরি মাস লোড হয়নি। জিপিএস / ইন্টারনেট দেখো।"));
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
        {tr(
          "Islamic month by your location. In Ramadan, each day shows সাহরি (last bite) and ইফতার (Maghrib).",
          "তোমার লোকেশন অনুযায়ী হিজরি মাস। রমজানে প্রতিদিন সাহরি ও ইফতারের সময় দেখায়।"
        )}
      </p>
      {profile.lat == null && (
        <button className="btn primary" disabled={locBusy} onClick={onLocate}>
          {locBusy ? tr("Finding you…", "খুঁজছি…") : tr("Use GPS for the calendar", "ক্যালেন্ডারের জন্য জিপিএস নাও")}
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
          <p className="tiny">
            {cal?.isRamadan ? tr("রমজান · fasting month", "রোজার মাস") : tr("Ramadan is month 9", "রমজান ৯ম মাস")}
          </p>
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
          {tr("Jump to Ramadan", "রমজানে যাও")}
        </button>
      )}
      {busy && <p className="muted">{tr("Loading month…", "মাস লোড হচ্ছে…")}</p>}
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
              <h3>{cal.isRamadan ? tr("Suhoor & Iftar", "সাহরি ও ইফতার") : picked.holidays[0] || tr("Day times", "দিনের সময়")}</h3>
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
                  {tr(
                    "Eat from Maghrib until Imsak. Fast from Imsak until Maghrib. Suhoor alarm fires 45 minutes before Imsak.",
                    "মাগরিব থেকে ইমসাক পর্যন্ত খাও। ইমসাক থেকে মাগরিব পর্যন্ত রোজা। ইমসাকের ৪৫ মিনিট আগে সাহরির অ্যালার্ম বাজে।"
                  )}
                </p>
              )}
            </article>
          )}
        </>
      )}
    </>
  );
}
