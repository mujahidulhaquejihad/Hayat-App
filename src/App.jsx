import { useEffect, useMemo, useState } from "react";
import {
  PRAYER_BN,
  KITCHEN_RULES,
  RAMADAN_MEALS,
  WATER_GOAL,
  ayahOfDay,
  armAgenda,
  askNotify,
  bmi,
  bmiLabel,
  buildAgenda,
  cmFromFtIn,
  daysAgo,
  defaultProfile,
  fetchPrayerTimes,
  fireNotify,
  formatClock,
  formatHms,
  ftInFromCm,
  getPosition,
  HIJRI_BN,
  loadState,
  namazStreak,
  nextPrayer,
  playChime,
  prayedOn,
  registerSW,
  reverseCity,
  unlockAudio,
  saveState,
  setLang,
  stopAlarm,
  swimWeek,
  tr,
  targetCalories,
  targetWeightKg,
  todayKey,
  todayPlan,
  uid,
  weeklyPlan,
  weeksToGoal,
} from "./lib";
import { IbadahHub, NamazHowTo } from "./ibadah";

const TABS = [
  { id: "home", label: "Home", bn: "ঘর" },
  { id: "eat", label: "Eat", bn: "খাবার" },
  { id: "namaz", label: "Namaz", bn: "নমাজ" },
  { id: "tasks", label: "Tasks", bn: "কাজ" },
  { id: "me", label: "Me", bn: "আমি" },
];

const WEEK_BN_SUN = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহস্পতি", "শুক্র", "শনি"];

function DockIcon({ id }) {
  const p = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  if (id === "home") {
    return (
      <svg {...p}>
        <path d="M4 11.5 12 4l8 7.5" />
        <path d="M6.5 10.5V20h11V10.5" />
      </svg>
    );
  }
  if (id === "eat") {
    return (
      <svg {...p}>
        <path d="M4 14c0-4 3.6-7 8-7s8 3 8 7" />
        <path d="M4 14h16v2a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" />
      </svg>
    );
  }
  if (id === "namaz") {
    return (
      <svg {...p}>
        <path d="M12 21a8 8 0 0 1-6.5-13A7 7 0 0 0 12 16a7 7 0 0 0 6.5-8A8 8 0 0 1 12 21z" />
      </svg>
    );
  }
  if (id === "tasks") {
    return (
      <svg {...p}>
        <path d="M20 7 10 17l-5-5" />
      </svg>
    );
  }
  return (
    <svg {...p}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

export default function App() {
  const [state, setState] = useState(loadState);
  const [tab, setTab] = useState(() => {
    const h = location.hash.replace("#", "");
    return TABS.some((t) => t.id === h) ? h : "home";
  });
  const [ibadah, setIbadah] = useState("times");
  const [now, setNow] = useState(() => new Date());
  const [prayer, setPrayer] = useState(null);
  const [prayerErr, setPrayerErr] = useState("");
  const [locBusy, setLocBusy] = useState(false);

  const [alarm, setAlarm] = useState(null);

  useEffect(() => saveState(state), [state]);
  useEffect(() => {
    registerSW().catch(() => {});
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    const onAlarm = (e) => setAlarm(e.detail?.on ? e.detail : null);
    window.addEventListener("hayat-alarm", onAlarm);
    const onSw = (e) => {
      if (e.data?.type === "stop-alarm") stopAlarm();
    };
    navigator.serviceWorker?.addEventListener("message", onSw);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("hayat-alarm", onAlarm);
      navigator.serviceWorker?.removeEventListener("message", onSw);
    };
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const profile = state.profile;
  setLang(profile.lang);

  useEffect(() => {
    if (!profile.lat || !profile.lng) return;
    let alive = true;
    setPrayerErr("");
    fetchPrayerTimes(profile.lat, profile.lng, profile.prayerMethod)
      .then((p) => {
        if (alive) setPrayer(p);
      })
      .catch((e) => {
        if (alive) setPrayerErr(e.message || "Could not load namaz times");
      });
    return () => {
      alive = false;
    };
  }, [profile.lat, profile.lng, profile.prayerMethod, todayKey(now)]);

  const agenda = useMemo(
    () => buildAgenda({ profile, prayerTimes: prayer, tasks: state.tasks, date: now }),
    [profile, prayer, state.tasks, todayKey(now), now.getMinutes()]
  );

  useEffect(() => {
    if (!state.onboarded) return;
    let alive = true;
    askNotify().finally(() => {
      if (alive) armAgenda(agenda);
    });
    return () => {
      alive = false;
    };
  }, [agenda, state.onboarded]);

  function patch(partial) {
    setState((s) => ({ ...s, ...partial }));
  }
  function patchProfile(partial) {
    setState((s) => ({ ...s, profile: { ...s.profile, ...partial } }));
  }

  async function useMyLocation() {
    setLocBusy(true);
    try {
      const pos = await getPosition();
      let city = "";
      try {
        city = await reverseCity(pos.lat, pos.lng);
      } catch {
        city = "My location";
      }
      patchProfile({ lat: pos.lat, lng: pos.lng, city });
    } catch {
      patchProfile({ lat: 23.8103, lng: 90.4125, city: "Dhaka (default)" });
    } finally {
      setLocBusy(false);
    }
  }

  if (!state.onboarded) {
    return (
      <Onboarding
        profile={profile}
        locBusy={locBusy}
        onChange={patchProfile}
        onLocate={useMyLocation}
        onDone={async () => {
          await askNotify();
          if (!profile.lat) await useMyLocation();
          patch({
            onboarded: true,
            weights: { [todayKey()]: profile.weightKg },
            tasks: [
              { id: uid(), title: tr("Swim (if today is a pool day)", "সাঁতার (আজ পুলের দিন হলে)"), time: "18:00", note: tr("45 min easy, then protein dinner", "৪৫ মিনিট হালকা, তারপর প্রোটিন ডিনার"), done: false },
              { id: uid(), title: tr("Last cha before Maghrib", "মাগরিবের আগে শেষ চা"), time: "16:30", note: tr("No sugar", "চিনি নয়"), done: false },
              { id: uid(), title: tr("Lay out ruti atta for dinner", "রাতের রুটির আটা রেডি করো"), time: "19:15", note: tr("Skip rice at night", "রাতে ভাত নয়"), done: false },
            ],
          });
        }}
      />
    );
  }

  return (
    <div className="shell">
      {alarm && (
        <div className="alarm-overlay" role="alertdialog" aria-live="assertive">
          <p className="kicker gold">{tr("সালাত · SALAH NOW", "সালাতের সময় এখন")}</p>
          <h1>{alarm.title || tr("Namaz", "নামাজ")}</h1>
          <p>{alarm.body}</p>
          <button
            className="btn primary alarm-stop"
            onClick={() => {
              stopAlarm();
              unlockAudio();
            }}
          >
            {tr("Stop alarm", "অ্যালার্ম বন্ধ")}
          </button>
        </div>
      )}
      <div className="paper">
        {tab === "home" && (
          <Home
            now={now}
            profile={profile}
            prayer={prayer}
            tasks={state.tasks}
            water={state.water}
            doneMeals={state.doneMeals}
            doneNamaz={state.doneNamaz}
            swims={state.swims}
            onSwims={(swims) => patch({ swims })}
            onWater={(n) =>
              patch({ water: { ...state.water, [todayKey()]: n } })
            }
            onTab={setTab}
            onIbadah={(pane) => {
              setIbadah(pane);
              setTab("namaz");
            }}
          />
        )}
        {tab === "eat" && (
          <Eat
            profile={profile}
            prayer={prayer}
            doneMeals={state.doneMeals}
            onToggleMeal={(id) => {
              const k = `${todayKey()}-${id}`;
              patch({ doneMeals: { ...state.doneMeals, [k]: !state.doneMeals[k] } });
            }}
          />
        )}
        {tab === "namaz" && (
          <IbadahHub
            pane={ibadah}
            onPane={setIbadah}
            profile={profile}
            locBusy={locBusy}
            onLocate={useMyLocation}
            quranPage={state.quranPage || 1}
            onQuranPage={(p) => {
              const k = todayKey();
              const read = p === (state.quranPage || 1) + 1;
              patch({
                quranPage: p,
                quranLog: read ? { ...state.quranLog, [k]: (state.quranLog[k] || 0) + 1 } : state.quranLog,
              });
            }}
            quranToday={state.quranLog[todayKey()] || 0}
            khatams={state.khatams}
            onKhatam={() => patch({ quranPage: 1, khatams: state.khatams + 1 })}
            onProfile={patchProfile}
            tasbihToday={state.tasbih[todayKey()] || 0}
            onTasbih={(n) => patch({ tasbih: { ...state.tasbih, [todayKey()]: n } })}
            prayer={prayer}
            childrenTimes={
              <TimesPane
                now={now}
                profile={profile}
                prayer={prayer}
                err={prayerErr}
                locBusy={locBusy}
                onLocate={useMyLocation}
                onProfile={patchProfile}
                doneNamaz={state.doneNamaz}
                onToggleNamaz={(name) => {
                  const k = `${todayKey()}-${name}`;
                  patch({ doneNamaz: { ...state.doneNamaz, [k]: !state.doneNamaz[k] } });
                }}
              />
            }
          />
        )}
        {tab === "tasks" && (
          <Tasks
            tasks={state.tasks}
            onTasks={(tasks) => patch({ tasks })}
          />
        )}
        {tab === "me" && (
          <Me
            profile={profile}
            weights={state.weights}
            onWeight={(kg) => {
              patchProfile({ weightKg: kg });
              if (kg > 0) setState((s) => ({ ...s, weights: { ...s.weights, [todayKey()]: kg } }));
            }}
            onProfile={patchProfile}
            onLocate={useMyLocation}
            locBusy={locBusy}
            onReset={() => {
              if (!window.confirm(tr("Erase all Hayat data, including weight, swim and namaz history?", "ওজন, সাঁতার ও নামাজের ইতিহাসসহ সব তথ্য মুছে ফেলবে?"))) return;
              localStorage.removeItem("hayat.v1");
              setState(loadState());
            }}
          />
        )}
        <nav className="dock">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "on" : ""}
              onClick={() => {
                if (t.id === "namaz") setIbadah("times");
                setTab(t.id);
              }}
            >
              <span className="dock-ic" aria-hidden>
                <DockIcon id={t.id} />
              </span>
              <span>{tr(t.label, t.bn)}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

function Onboarding({ profile, onChange, onLocate, locBusy, onDone }) {
  const [step, setStep] = useState(0);
  const ft = ftInFromCm(profile.heightCm);
  const [feet, setFeet] = useState(String(ft.ftAdj ?? ft.ft));
  const [inch, setInch] = useState(String(ft.inch));

  function setHeight(f, i) {
    setFeet(f);
    setInch(i);
    onChange({ heightCm: cmFromFtIn(f || 0, i || 0) });
  }

  return (
    <div className="shell">
      <div className="paper onboard">
        <p className="kicker">হায়াত · Hayat</p>
        {step === 0 && (
          <section className="hero-copy">
            <div className="seg">
              <button className={profile.lang !== "bn" ? "on" : ""} onClick={() => onChange({ lang: "en" })}>
                English
              </button>
              <button className={profile.lang === "bn" ? "on" : ""} onClick={() => onChange({ lang: "bn" })}>
                বাংলা
              </button>
            </div>
            <h1>{tr("Eat from the kitchen. Pray on time. Live lighter.", "ঘরের খাবার খাও। সময়মতো নামাজ পড়ো। হালকা থাকো।")}</h1>
            <p>
              {tr(
                "Built for homemade Bangladeshi food, five daily salah, and the life you already have — cha, swimming, and whatever Ammi cooked.",
                "ঘরোয়া বাংলাদেশি খাবার, পাঁচ ওয়াক্ত সালাত আর তোমার রোজকার জীবনের জন্য — চা, সাঁতার, আর আম্মু যা রান্না করেছেন।"
              )}
            </p>
            <ul className="pills">
              <li>{tr("Namaz alarms by GPS", "জিপিএসে নামাজের অ্যালার্ম")}</li>
              <li>{tr("Meal pings", "খাবারের রিমাইন্ডার")}</li>
              <li>{tr("Daily tasks", "দৈনিক কাজ")}</li>
            </ul>
            <button className="btn primary" onClick={() => setStep(1)}>
              {tr("Start with my body", "শরীর দিয়ে শুরু")}
            </button>
          </section>
        )}
        {step === 1 && (
          <section>
            <h2>{tr("You, on paper", "তোমার তথ্য")}</h2>
            <label>
              {tr("Name", "নাম")}
              <input
                value={profile.name}
                placeholder={tr("What should we call you?", "তোমাকে কী নামে ডাকব?")}
                onChange={(e) => onChange({ name: e.target.value })}
              />
            </label>
            <div className="row">
              <label>
                {tr("Age", "বয়স")}
                <input
                  type="number"
                  min="14"
                  max="80"
                  value={profile.age}
                  onChange={(e) => onChange({ age: Number(e.target.value) })}
                />
              </label>
              <label>
                {tr("Sex", "লিঙ্গ")}
                <select
                  value={profile.sex}
                  onChange={(e) => onChange({ sex: e.target.value })}
                >
                  <option value="male">{tr("Male", "পুরুষ")}</option>
                  <option value="female">{tr("Female", "নারী")}</option>
                </select>
              </label>
            </div>
            <div className="row">
              <label>
                {tr("Height (ft)", "উচ্চতা (ফুট)")}
                <input value={feet} onChange={(e) => setHeight(e.target.value, inch)} />
              </label>
              <label>
                {tr("Inches", "ইঞ্চি")}
                <input value={inch} onChange={(e) => setHeight(feet, e.target.value)} />
              </label>
            </div>
            <label>
              {tr("Weight (kg)", "ওজন (কেজি)")}
              <input
                type="number"
                step="0.1"
                value={profile.weightKg}
                onChange={(e) => onChange({ weightKg: Number(e.target.value) })}
              />
            </label>
            <button className="btn primary" onClick={() => setStep(2)}>
              {tr("Next — kitchen & pool", "পরের ধাপ — রান্নাঘর ও পুল")}
            </button>
          </section>
        )}
        {step === 2 && (
          <section>
            <h2>{tr("How you actually live", "তোমার রোজকার জীবন")}</h2>
            <label>
              {tr("Cups of cha a day", "দিনে কত কাপ চা")}
              <input
                type="number"
                min="0"
                max="12"
                value={profile.teaCups}
                onChange={(e) => onChange({ teaCups: Number(e.target.value) })}
              />
            </label>
            <label>
              {tr("Swim days / week", "সপ্তাহে কত দিন সাঁতার")}
              <input
                type="number"
                min="0"
                max="7"
                value={profile.swimDays}
                onChange={(e) => onChange({ swimDays: Number(e.target.value) })}
              />
            </label>
            <label>
              {tr("Activity", "কাজকর্ম")}
              <select
                value={profile.activity}
                onChange={(e) => onChange({ activity: e.target.value })}
              >
                <option value="desk">{tr("Mostly sitting", "বেশিরভাগ বসে থাকা")}</option>
                <option value="light">{tr("Light walks", "হালকা হাঁটা")}</option>
                <option value="swim">{tr("Swimming 3–5 days (you)", "সপ্তাহে ৩–৫ দিন সাঁতার (তুমি)")}</option>
                <option value="heavy">{tr("Hard training", "কঠিন ব্যায়াম")}</option>
              </select>
            </label>
            <label>
              {tr("Goal", "লক্ষ্য")}
              <select
                value={profile.goal}
                onChange={(e) => onChange({ goal: e.target.value })}
              >
                <option value="lose">{tr("Lose fat, keep muscle", "চর্বি কমাও, পেশি রাখো")}</option>
                <option value="maintain">{tr("Hold weight", "ওজন ধরে রাখো")}</option>
                <option value="gain">{tr("Gain", "ওজন বাড়াও")}</option>
              </select>
            </label>
            <button className="btn primary" onClick={() => setStep(3)}>
              {tr("Next — namaz location", "পরের ধাপ — নামাজের লোকেশন")}
            </button>
          </section>
        )}
        {step === 3 && (
          <section>
            <h2>{tr("Namaz by your sky", "তোমার আকাশে নামাজ")}</h2>
            <p className="muted">
              {tr(
                "Times come from your GPS via Aladhan (Karachi method, Hanafi Asr — usual in Bangladesh). Allow notifications so Fajr actually wakes you.",
                "সময় আসে তোমার জিপিএস থেকে (করাচি পদ্ধতি, হানাফি আসর — বাংলাদেশে প্রচলিত)। নোটিফিকেশন চালু রাখো যাতে ফজরে সত্যিই ঘুম ভাঙে।"
              )}
            </p>
            <button className="btn ghost" disabled={locBusy} onClick={onLocate}>
              {locBusy
                ? tr("Finding you…", "খুঁজছি…")
                : profile.city
                  ? `${tr("Located", "লোকেশন")}: ${profile.city}`
                  : tr("Use my location", "আমার লোকেশন নাও")}
            </button>
            {profile.lat && (
              <p className="tiny">
                {profile.lat.toFixed(3)}, {profile.lng.toFixed(3)}
              </p>
            )}
            <button className="btn primary" onClick={onDone}>
              {tr("Build my plan", "আমার প্ল্যান বানাও")}
            </button>
          </section>
        )}
        <div className="dots">
          {[0, 1, 2, 3].map((i) => (
            <i key={i} className={i === step ? "on" : ""} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AyahCard({ ayah }) {
  return (
    <article className="ayah-card">
      <p className="kicker gold">{tr("Ayah of the day · আয়াত", "আজকের আয়াত")}</p>
      <p className="ayah-ar" dir="rtl" lang="ar">
        {ayah.ar}
      </p>
      {ayah.pron && <p className="ayah-pron">{ayah.pron}</p>}
      {tr(true, false) && <p className="ayah-en">{ayah.en}</p>}
      <p className="ayah-bn">{ayah.bn}</p>
      <cite>{ayah.ref}</cite>
    </article>
  );
}

function SwimCard({ swims, goal, now, onSwims }) {
  const [min, setMin] = useState("45");
  const [laps, setLaps] = useState("");
  const wk = swimWeek(swims, goal, now);
  const today = todayKey(now);
  const recent = [...swims].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3);

  return (
    <section className="card stack">
      <div className="card-h">
        <h3>{tr("Swim · সাঁতার", "সাঁতার")}</h3>
        <span>
          {wk.thisWeek}/{wk.target} {tr("this week", "এই সপ্তাহে")}
          {wk.streak > 0 && ` · ${wk.streak} ${tr("wk streak", "সপ্তাহ টানা")}`}
        </span>
      </div>
      <div className="week-dots" aria-hidden>
        {Array.from({ length: wk.target }, (_, i) => (
          <i key={i} className={i < wk.thisWeek ? "on" : ""} />
        ))}
      </div>
      <form
        className="row swim-form"
        onSubmit={(e) => {
          e.preventDefault();
          const m = Number(min);
          if (!(m > 0)) return;
          onSwims([...swims, { id: uid(), date: today, min: m, laps: Number(laps) || 0 }]);
          setLaps("");
        }}
      >
        <label>
          {tr("Minutes", "মিনিট")}
          <input type="number" min="1" value={min} onChange={(e) => setMin(e.target.value)} />
        </label>
        <label>
          {tr("Laps (optional)", "ল্যাপ (ঐচ্ছিক)")}
          <input type="number" min="0" value={laps} onChange={(e) => setLaps(e.target.value)} />
        </label>
        <button className="btn primary" type="submit">
          {tr("Log today's swim", "আজকের সাঁতার যোগ করো")}
        </button>
      </form>
      {recent.length > 0 && (
        <ul className="swim-log">
          {recent.map((s) => (
            <li key={s.id}>
              <span>{s.date === today ? tr("Today", "আজ") : s.date.slice(5)}</span>
              <b>
                {s.min} {tr("min", "মিনিট")}
                {s.laps ? ` · ${s.laps} ${tr("laps", "ল্যাপ")}` : ""}
              </b>
              <button
                className="x"
                aria-label={tr("Delete swim", "সাঁতার মুছুন")}
                onClick={() => onSwims(swims.filter((x) => x.id !== s.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Home({ now, profile, prayer, tasks, water, doneMeals, doneNamaz, swims, onSwims, onWater, onTab, onIbadah }) {
  const b = bmi(profile.weightKg, profile.heightCm);
  const bl = bmiLabel(b);
  const kcal = targetCalories(profile);
  const target = targetWeightKg(profile.heightCm);
  const weeks = weeksToGoal(profile);
  const day = todayPlan(profile, now);
  const nxt = prayer ? nextPrayer(prayer.times, now) : null;
  const glasses = water[todayKey(now)] || 0;
  const openTasks = tasks.filter((t) => !t.done).length;
  const name = profile.name || tr("bhai", "ভাই");
  const prayed = prayedOn(doneNamaz, now);
  const streak = namazStreak(doneNamaz, now).current;

  return (
    <main className="page">
      <header className="top">
        <div>
          <p className="kicker">{tr("Assalamu alaikum", "আসসালামু আলাইকুম")}</p>
          <h1>{name}</h1>
        </div>
        <button className="chip ghost" type="button" onClick={() => onIbadah("hijri")}>
          {prayer?.hijri
            ? `${prayer.hijri.day} ${tr(prayer.hijri.month.en, HIJRI_BN[Number(prayer.hijri.month.number)])}`
            : now.toLocaleDateString(tr(undefined, "bn-BD"), { weekday: "short", day: "numeric", month: "short" })}
        </button>
      </header>

      {nxt && (
        <button className="salah-card" onClick={() => onTab("namaz")}>
          <div>
            <p className="kicker gold">{tr("Next namaz", "পরের নামাজ")}</p>
            <h2>
              <span className="ar">{nxt.bangla}</span> {tr(nxt.name, "")}
            </h2>
            <p>{formatClock(nxt.at)}</p>
            <p className="tiny">
              {prayed}/5 {tr("prayed today", "আজ পড়া হয়েছে")}
              {streak > 0 && ` · ${streak} ${tr("day streak", "দিন টানা")}`}
            </p>
          </div>
          <div className="count">{formatHms(nxt.at - now)}</div>
        </button>
      )}

      {prayer?.isRamadan && prayer.ramadan && (
        <section className="ramadan-home">
          <p className="kicker gold">{tr("রমজান · Ramadan", "রমজান")}</p>
          <div className="ramadan-pair">
            <article>
              <small>সাহরি শেষ</small>
              <strong>{prayer.ramadan.suhoorEnd}</strong>
              <em>{tr("Imsak", "ইমসাক")}</em>
            </article>
            <article>
              <small>ইফতার</small>
              <strong>{prayer.ramadan.iftar}</strong>
              <em>{tr("Maghrib", "মাগরিব")}</em>
            </article>
          </div>
          <button className="textish" onClick={() => onIbadah("hijri")}>
            {tr("Full Hijri calendar", "পুরো হিজরি ক্যালেন্ডার")}
          </button>
        </section>
      )}

      <AyahCard ayah={ayahOfDay(now)} />

      <div className="ibadah-row">
        <button type="button" onClick={() => onIbadah("quran")}>
          <b>কুরআন</b>
          {tr("Daily pages", "দৈনিক পৃষ্ঠা")}
        </button>
        <button type="button" onClick={() => onIbadah("tasbih")}>
          <b>তাসবিহ</b>
          {tr("Counter", "গণনা")}
        </button>
        <button type="button" onClick={() => onIbadah("qibla")}>
          <b>কিবলা</b>
          {tr("Compass", "কম্পাস")}
        </button>
        <button type="button" onClick={() => onIbadah("dua")}>
          <b>দোয়া</b>
          {tr("Search", "খুঁজুন")}
        </button>
        <button type="button" onClick={() => onIbadah("hijri")}>
          <b>হিজরি</b>
          {tr("Calendar", "ক্যালেন্ডার")}
        </button>
        <button type="button" onClick={() => onTab("me")}>
          <b>{tr("Weight", "ওজন")}</b>
          {profile.weightKg} → {target} kg
        </button>
      </div>

      <section className="stats">
        <article>
          <small>BMI</small>
          <strong>{b.toFixed(1)}</strong>
          <em className={bl.tone}>{bl.text}</em>
        </article>
        <article>
          <small>{tr("Eat around", "খাবার")}</small>
          <strong>{kcal}</strong>
          <em>{tr("kcal / day", "ক্যালরি / দিন")}</em>
        </article>
        <article>
          <small>{tr("Aim", "লক্ষ্য")}</small>
          <strong>{target}</strong>
          <em>{tr(`kg · ~${weeks} wks`, `কেজি · ~${weeks} সপ্তাহ`)}</em>
        </article>
      </section>

      <SwimCard swims={swims} goal={profile.swimDays} now={now} onSwims={onSwims} />

      <section className="card">
        <div className="card-h">
          <h3>{tr("Today’s plate", "আজকের প্লেট")}</h3>
          <button className="textish" onClick={() => onTab("eat")}>{tr("Full diet", "পুরো ডায়েট")}</button>
        </div>
        {day.isSwim && <p className="flag">{tr("Swim day — 1½ cup rice at lunch.", "সাঁতারের দিন — দুপুরে দেড় কাপ ভাত।")}</p>}
        <ul className="meals-mini">
          {day.meals.map((m) => {
            const done = doneMeals[`${todayKey(now)}-${m.id}`];
            return (
              <li key={m.id} className={done ? "done" : ""}>
                <span>{m.time}</span>
                <b>{tr(m.slot, m.bangla)}</b>
                <em>{m.title}</em>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <div className="card-h">
          <h3>{tr("Water · পানি", "পানি")}</h3>
          <span>{glasses}/{WATER_GOAL} {tr("glasses", "গ্লাস")}</span>
        </div>
        <div className="glasses">
          {Array.from({ length: WATER_GOAL }, (_, i) => (
            <button
              key={i}
              className={i < glasses ? "full" : ""}
              onClick={() => onWater(i + 1 === glasses ? i : i + 1)}
              aria-label={`${tr("glass", "গ্লাস")} ${i + 1}`}
            />
          ))}
        </div>
      </section>

      <button className="card task-jump" onClick={() => onTab("tasks")}>
        <h3>{tr("Daily tasks", "দৈনিক কাজ")}</h3>
        <p>
          {openTasks
            ? tr(`${openTasks} still open`, `${openTasks}টি বাকি`)
            : tr("All clear — add the next one.", "সব শেষ — পরেরটা যোগ করো।")}
        </p>
      </button>
    </main>
  );
}

function Eat({ profile, prayer, doneMeals, onToggleMeal }) {
  const plan = weeklyPlan(profile);
  const today = todayPlan(profile);
  const [view, setView] = useState("today");
  const cha = plan.cha;
  const ramadan = prayer?.isRamadan && prayer.ramadan;
  const ramadanPlates = ramadan
    ? RAMADAN_MEALS.map((m) => ({
        ...m,
        time: m.id === "suhoor" ? `${tr("until", "শেষ")} ${prayer.ramadan.suhoorEnd}` : prayer.ramadan.iftar,
      }))
    : null;

  return (
    <main className="page eat-page">
      <header className="top">
        <div>
          <p className="kicker">ঘরোয়া রান্না</p>
          <h1>{tr("Eat", "খাবার")}</h1>
        </div>
        <span className="chip">{plan.kcal} {tr("kcal", "ক্যালরি")}</span>
      </header>
      <ul className="rules">
        {KITCHEN_RULES.map((r) => (
          <li key={r.en}>
            <b>{r.bn}</b>
            {tr(true, false) && <span>{r.en}</span>}
          </li>
        ))}
      </ul>
      <div className="seg">
        <button className={view === "today" ? "on" : ""} onClick={() => setView("today")}>{tr("Today", "আজ")}</button>
        <button className={view === "week" ? "on" : ""} onClick={() => setView("week")}>{tr("Week", "সপ্তাহ")}</button>
        <button className={view === "bazaar" ? "on" : ""} onClick={() => setView("bazaar")}>{tr("Bazaar", "বাজার")}</button>
      </div>

      {view === "today" && ramadan && (
        <>
          <p className="flag">
            {tr(
              "Ramadan — eat at Suhoor and Iftar only. Fast from Imsak to Maghrib.",
              "রমজান — শুধু সাহরি ও ইফতারে খাও। ইমসাক থেকে মাগরিব পর্যন্ত রোজা।"
            )}
          </p>
          {ramadanPlates.map((m) => {
            const done = doneMeals[`${todayKey()}-${m.id}`];
            return (
              <article key={m.id} className={`meal-card ${done ? "done" : ""}`}>
                <header>
                  <div>
                    <p className="kicker">{m.bangla} · {m.time}</p>
                    <h3>{tr(m.slot, m.bangla)}</h3>
                  </div>
                  <button className="check" onClick={() => onToggleMeal(m.id)}>
                    {done ? "✓" : tr("Eat", "খেলাম")}
                  </button>
                </header>
                <ul className="food-chips">
                  {m.items.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
                <p className="muted">{tr(m.note, m.noteBn || m.note)}</p>
              </article>
            );
          })}
        </>
      )}

      {view === "today" && !ramadan && (
        <>
          <p className="tea-line">
            {tr("Cha", "চা")}: {profile.teaCups} {tr("cups now", "কাপ এখন")} → <b>{cha.week1}</b>{" "}
            {tr("this week, then", "এই সপ্তাহে, তারপর")} {cha.after}. {cha.rule}
          </p>
          {today.isSwim && <p className="flag">{tr("Swim today — 1½ cup rice at lunch.", "আজ সাঁতার — দুপুরে দেড় কাপ ভাত।")}</p>}
          {today.meals.map((m) => {
            const done = doneMeals[`${todayKey()}-${m.id}`];
            return (
              <article key={m.id} className={`meal-card ${done ? "done" : ""}`}>
                <header>
                  <div>
                    <p className="kicker">{m.bangla} · {m.time}</p>
                    <h3>{tr(m.slot, m.bangla)}</h3>
                  </div>
                  <button className="check" onClick={() => onToggleMeal(m.id)}>
                    {done ? "✓" : tr("Eat", "খেলাম")}
                  </button>
                </header>
                <ul className="food-chips">
                  {(m.items || [m.title]).map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
                <p className="muted">{m.note}</p>
              </article>
            );
          })}
        </>
      )}

      {view === "week" && (
        <div className="week-grid">
          {plan.days.map((d) => (
            <article key={d.day} className="week-cell">
              <h3>
                {tr(d.day, WEEK_BN_SUN[d.i])}
                {d.isSwim && <span className="swim">{tr("swim", "সাঁতার")}</span>}
              </h3>
              <p>{d.protein.name}</p>
              <small>
                {d.isSwim ? tr("1½ cup bhat", "দেড় কাপ ভাত") : tr("1 cup bhat", "১ কাপ ভাত")} ·{" "}
                {tr("ruti at night", "রাতে রুটি")}
              </small>
            </article>
          ))}
        </div>
      )}

      {view === "bazaar" &&
        plan.grocery.map((g) => (
          <article key={g.group} className="card">
            <h3>{g.group}</h3>
            <ul className="dots-list">
              {g.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </article>
        ))}
    </main>
  );
}

function TimesPane({ now, profile, prayer, err, locBusy, onLocate, onProfile, doneNamaz, onToggleNamaz }) {
  const nxt = prayer ? nextPrayer(prayer.times, now) : null;
  const hijri = prayer?.hijri;
  const prayed = prayedOn(doneNamaz, now);
  const streak = namazStreak(doneNamaz, now);
  const week = Array.from({ length: 7 }, (_, i) => daysAgo(6 - i, now));
  const [guide, setGuide] = useState(null);

  if (guide) {
    const row = (prayer?.times || []).find((p) => p.name === guide);
    return <NamazHowTo name={guide} clock={row?.clock} onBack={() => setGuide(null)} />;
  }

  return (
    <>
      {hijri && (
        <p className="namaz-meta muted">
          <span>
            {hijri.day} {tr(hijri.month.en, HIJRI_BN[Number(hijri.month.number)])} {hijri.year}
          </span>
          <span>{profile.city}</span>
        </p>
      )}
      {prayer?.isRamadan && prayer.ramadan && (
        <ul className="ramadan-times">
          <li>
            <span>সাহরি শেষ</span>
            <b>{prayer.ramadan.suhoorEnd}</b>
          </li>
          <li className="iftar">
            <span>ইফতার</span>
            <b>{prayer.ramadan.iftar}</b>
          </li>
        </ul>
      )}
      {err && <p className="flag alert">{err}. {tr("Check location / network.", "লোকেশন / ইন্টারনেট দেখো।")}</p>}
      {!profile.lat && (
        <button className="btn primary" onClick={onLocate}>
          {tr("Allow location for salah times", "নামাজের সময়ের জন্য লোকেশন দাও")}
        </button>
      )}
      <ol className="salah-list">
        {(prayer?.times || Object.keys(PRAYER_BN).map((name) => ({ name, bangla: PRAYER_BN[name], clock: "--:--" }))).map(
          (p) => {
            const active = nxt && p.name === nxt.name;
            const done = doneNamaz?.[`${todayKey(now)}-${p.name}`];
            return (
              <li key={p.name} className={`${active ? "active" : ""} ${done ? "prayed" : ""}`}>
                <button
                  className="salah-tick"
                  aria-label={done ? tr(`${p.name} prayed`, `${p.bangla} পড়া হয়েছে`) : tr(`Mark ${p.name} prayed`, `${p.bangla} পড়েছি`)}
                  onClick={() => {
                    onToggleNamaz(p.name);
                    if (!done && active) stopAlarm();
                  }}
                >
                  {done ? "✓" : ""}
                </button>
                <button type="button" className="salah-open" onClick={() => setGuide(p.name)}>
                  <span className="ar">{p.bangla}</span>
                  <b>{tr(p.name, "")}</b>
                  <time>{active ? formatHms(nxt.at - now) : p.clock}</time>
                </button>
              </li>
            );
          }
        )}
      </ol>
      <p className="tiny">
        {tr(
          `${prayed} of 5 marked. Tap a name to see rakats. Tick the circle after you pray.`,
          `৫ ওয়াক্তের ${prayed} টি চিহ্নিত। রাকাত দেখতে নামে চাপো। নামাজের পর বৃত্তে টিক দাও।`
        )}
      </p>
      <section className="card stack">
        <div className="card-h">
          <h3>{tr("Streak", "ধারাবাহিকতা")}</h3>
          <span>
            {tr(`Best ${streak.best} days`, `সেরা ${streak.best} দিন`)}
          </span>
        </div>
        <p className="streak-big">
          <strong>{streak.current}</strong>{" "}
          {tr("days in a row with all five", "দিন টানা পাঁচ ওয়াক্ত")}
        </p>
        <ol className="namaz-week">
          {week.map((d) => {
            const n = prayedOn(doneNamaz, d);
            return (
              <li key={todayKey(d)} className={n === 5 ? "full" : n ? "part" : ""}>
                <span>{d.toLocaleDateString(tr("en", "bn-BD"), { weekday: "narrow" })}</span>
                <b>{n}</b>
              </li>
            );
          })}
        </ol>
      </section>
      <section className="card namaz-settings">
        <label className="toggle">
          <input
            type="checkbox"
            checked={profile.notifyNamaz}
            onChange={(e) => onProfile({ notifyNamaz: e.target.checked })}
          />
          {tr("Alarm for all five", "পাঁচ ওয়াক্তেই অ্যালার্ম")}
        </label>
        <label>
          {tr("Remind me", "কখন মনে করাবে")}
          <select
            value={profile.namazOffsetMin}
            onChange={(e) => onProfile({ namazOffsetMin: Number(e.target.value) })}
          >
            <option value="0">{tr("At the azan time", "আজানের সময়")}</option>
            <option value="-10">{tr("10 min before", "১০ মিনিট আগে")}</option>
            <option value="-5">{tr("5 min before", "৫ মিনিট আগে")}</option>
          </select>
        </label>
        <button
          className="btn ghost"
          onClick={async () => {
            unlockAudio();
            await askNotify();
            fireNotify({
              title: "Fajr · ফজর",
              body: tr("Test alarm — phone should ring now.", "টেস্ট অ্যালার্ম — ফোন এখন বাজার কথা।"),
              tag: "test",
              sticky: true,
            });
          }}
        >
          {tr("Test full alarm", "পুরো অ্যালার্ম টেস্ট")}
        </button>
        <p className="tiny">
          {tr(
            "Allow notifications, Alarms & reminders, and Unrestricted battery. Then tap Test — you should hear the siren. Keep Hayat installed; do not force-stop it.",
            "নোটিফিকেশন, অ্যালার্ম ও রিমাইন্ডার, আর আনরেস্ট্রিক্টেড ব্যাটারি চালু করো। তারপর টেস্ট চাপো — সাইরেন শোনার কথা। হায়াত ফোর্স-স্টপ করো না।"
          )}
        </p>
      </section>
    </>
  );
}

function Tasks({ tasks, onTasks }) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");

  function add(e) {
    e.preventDefault();
    if (!title.trim()) return;
    onTasks([{ id: uid(), title: title.trim(), time, note, done: false }, ...tasks]);
    setTitle("");
    setTime("");
    setNote("");
  }

  return (
    <main className="page">
      <header className="top">
        <div>
          <p className="kicker">আজকের কাজ</p>
          <h1>{tr("Reminders", "রিমাইন্ডার")}</h1>
        </div>
      </header>
      <form className="card add-task" onSubmit={add}>
        <input
          value={title}
          placeholder={tr("e.g. Swim 45 min, call Ammu", "যেমন: ৪৫ মিনিট সাঁতার, আম্মুকে ফোন")}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="row">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          <input
            value={note}
            placeholder={tr("Optional note", "নোট (ঐচ্ছিক)")}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <button className="btn primary" type="submit">
          {tr("Add task", "কাজ যোগ করো")}
        </button>
      </form>
      <ul className="task-list">
        {tasks.map((t) => (
          <li key={t.id} className={t.done ? "done" : ""}>
            <button
              className="tick"
              onClick={() =>
                onTasks(tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))
              }
              aria-label={tr("Mark done", "সম্পন্ন")}
            />
            <div>
              <b>{t.title}</b>
              <p>
                {t.time && <time>{t.time}</time>} {t.note}
              </p>
            </div>
            <button
              className="x"
              onClick={() => onTasks(tasks.filter((x) => x.id !== t.id))}
              aria-label={tr("Delete", "মুছুন")}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {tasks.length === 0 && <p className="muted">{tr("Nothing yet. Add the next thing.", "এখনো কিছু নেই। পরের কাজটা যোগ করো।")}</p>}
    </main>
  );
}

function WeightChart({ weights, target }) {
  const pts = Object.entries(weights)
    .filter(([, kg]) => kg > 0)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-30);
  if (pts.length < 2) {
    return <p className="tiny">{tr("Log your weight on two different days to see the line.", "লাইন দেখতে দুই দিন ওজন লিখো।")}</p>;
  }
  const kgs = pts.map(([, kg]) => kg);
  const lo = Math.min(...kgs) - 0.5;
  const hi = Math.max(...kgs) + 0.5;
  const showGoal = target >= lo && target <= hi;
  const W = 300;
  const H = 120;
  const x = (i) => (i / (pts.length - 1)) * W;
  const y = (kg) => H - ((kg - lo) / (hi - lo)) * H;
  const first = kgs[0];
  const last = kgs[kgs.length - 1];
  const diff = +(last - first).toFixed(1);

  return (
    <>
      <svg className="weight-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={tr("Weight trend", "ওজনের ধারা")}>
        {showGoal && <line x1="0" x2={W} y1={y(target)} y2={y(target)} className="goal" />}
        <polyline points={pts.map(([, kg], i) => `${x(i)},${y(kg)}`).join(" ")} />
      </svg>
      <p className="tiny">
        {tr(
          `${pts[0][0].slice(5)}: ${first} kg → now ${last} kg (${diff > 0 ? "+" : ""}${diff}). Target ${target} kg.`,
          `${pts[0][0].slice(5)}: ${first} কেজি → এখন ${last} কেজি (${diff > 0 ? "+" : ""}${diff})। লক্ষ্য ${target} কেজি।`
        )}
      </p>
    </>
  );
}

function Me({ profile, weights, onWeight, onProfile, onLocate, locBusy, onReset }) {
  const ft = ftInFromCm(profile.heightCm);
  const [feet, setFeet] = useState(String(ft.ftAdj ?? ft.ft));
  const [inch, setInch] = useState(String(ft.inch));
  const b = bmi(profile.weightKg, profile.heightCm);
  const target = targetWeightKg(profile.heightCm);
  const toGo = +(profile.weightKg - target).toFixed(1);

  return (
    <main className="page">
      <header className="top">
        <div>
          <p className="kicker">প্রোফাইল</p>
          <h1>{tr("You", "তুমি")}</h1>
        </div>
      </header>
      <div className="seg">
        <button className={profile.lang !== "bn" ? "on" : ""} onClick={() => onProfile({ lang: "en" })}>
          English
        </button>
        <button className={profile.lang === "bn" ? "on" : ""} onClick={() => onProfile({ lang: "bn" })}>
          বাংলা
        </button>
      </div>
      <section className="card stack">
        <div className="card-h">
          <h3>{tr("Weight · ওজন", "ওজন")}</h3>
          <span>
            BMI {b.toFixed(1)} ·{" "}
            {toGo > 0 ? tr(`${toGo} kg to go`, `আর ${toGo} কেজি`) : tr("At target", "লক্ষ্যে পৌঁছেছ")}
          </span>
        </div>
        <label>
          {tr("Today's weight (kg)", "আজকের ওজন (কেজি)")}
          <input type="number" step="0.1" value={profile.weightKg} onChange={(e) => onWeight(Number(e.target.value))} />
        </label>
        <WeightChart weights={weights} target={target} />
      </section>
      <section className="card stack">
        <label>
          {tr("Name", "নাম")}
          <input value={profile.name} onChange={(e) => onProfile({ name: e.target.value })} />
        </label>
        <div className="row">
          <label>
            {tr("Age", "বয়স")}
            <input type="number" value={profile.age} onChange={(e) => onProfile({ age: Number(e.target.value) })} />
          </label>
          <label>
            {tr("Swim days", "সাঁতারের দিন")}
            <input type="number" value={profile.swimDays} onChange={(e) => onProfile({ swimDays: Number(e.target.value) })} />
          </label>
        </div>
        <div className="row">
          <label>
            {tr("Height ft", "উচ্চতা ফুট")}
            <input
              value={feet}
              onChange={(e) => {
                setFeet(e.target.value);
                onProfile({ heightCm: cmFromFtIn(e.target.value, inch) });
              }}
            />
          </label>
          <label>
            {tr("In", "ইঞ্চি")}
            <input
              value={inch}
              onChange={(e) => {
                setInch(e.target.value);
                onProfile({ heightCm: cmFromFtIn(feet, e.target.value) });
              }}
            />
          </label>
        </div>
        <label>
          {tr("Cha cups", "চায়ের কাপ")}
          <input type="number" value={profile.teaCups} onChange={(e) => onProfile({ teaCups: Number(e.target.value) })} />
        </label>
      </section>
      <section className="card stack">
        <label className="toggle">
          <input type="checkbox" checked={profile.notifyMeals} onChange={(e) => onProfile({ notifyMeals: e.target.checked })} />
          {tr("Meal notifications", "খাবারের নোটিফিকেশন")}
        </label>
        <label className="toggle">
          <input type="checkbox" checked={profile.notifyTasks} onChange={(e) => onProfile({ notifyTasks: e.target.checked })} />
          {tr("Task notifications", "কাজের নোটিফিকেশন")}
        </label>
        <label className="toggle">
          <input type="checkbox" checked={profile.notifyNamaz} onChange={(e) => onProfile({ notifyNamaz: e.target.checked })} />
          {tr("Namaz alarms", "নামাজের অ্যালার্ম")}
        </label>
      </section>
      <button className="btn ghost loc" disabled={locBusy} onClick={onLocate}>
        {locBusy ? tr("Finding you…", "খুঁজছি…") : tr("Refresh location", "লোকেশন আপডেট")}
        {profile.city ? <span className="tiny">{profile.city}</span> : null}
      </button>
      <button
        className="btn ghost"
        onClick={async () => {
          const p = await askNotify();
          playChime("meal");
          if (p === "granted") fireNotify({ title: "Hayat", body: tr("Notifications are on.", "নোটিফিকেশন চালু আছে।"), tag: "ok" });
        }}
      >
        {tr("Test notifications", "নোটিফিকেশন টেস্ট")}
      </button>
      <button className="btn danger" onClick={onReset}>
        {tr("Start over", "নতুন করে শুরু")}
      </button>
    </main>
  );
}
