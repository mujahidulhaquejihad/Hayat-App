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
  defaultProfile,
  fetchPrayerTimes,
  fireNotify,
  formatClock,
  formatHms,
  ftInFromCm,
  getPosition,
  loadState,
  nextPrayer,
  playChime,
  registerSW,
  reverseCity,
  unlockAudio,
  saveState,
  stopAlarm,
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
            tasks: [
              { id: uid(), title: "Swim (if today is a pool day)", time: "18:00", note: "45 min easy, then protein dinner", done: false },
              { id: uid(), title: "Last cha before Maghrib", time: "16:30", note: "No sugar", done: false },
              { id: uid(), title: "Lay out ruti atta for dinner", time: "19:15", note: "Skip rice at night", done: false },
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
          <p className="kicker gold">সালাত · SALAH NOW</p>
          <h1>{alarm.title || "Namaz"}</h1>
          <p>{alarm.body}</p>
          <button
            className="btn primary alarm-stop"
            onClick={() => {
              stopAlarm();
              unlockAudio();
            }}
          >
            Stop alarm
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
            onQuranPage={(p) => patch({ quranPage: p })}
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
            onProfile={patchProfile}
            onLocate={useMyLocation}
            locBusy={locBusy}
            onReset={() => {
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
              <span>{t.label}</span>
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
            <h1>Eat from the kitchen. Pray on time. Live lighter.</h1>
            <p>
              Built for homemade Bangladeshi food, five daily salah, and the life
              you already have — cha, swimming, and whatever Ammi cooked.
            </p>
            <ul className="pills">
              <li>Namaz alarms by GPS</li>
              <li>Meal pings</li>
              <li>Daily tasks</li>
            </ul>
            <button className="btn primary" onClick={() => setStep(1)}>
              Start with my body
            </button>
          </section>
        )}
        {step === 1 && (
          <section>
            <h2>You, on paper</h2>
            <label>
              Name
              <input
                value={profile.name}
                placeholder="What should we call you?"
                onChange={(e) => onChange({ name: e.target.value })}
              />
            </label>
            <div className="row">
              <label>
                Age
                <input
                  type="number"
                  min="14"
                  max="80"
                  value={profile.age}
                  onChange={(e) => onChange({ age: Number(e.target.value) })}
                />
              </label>
              <label>
                Sex
                <select
                  value={profile.sex}
                  onChange={(e) => onChange({ sex: e.target.value })}
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
            </div>
            <div className="row">
              <label>
                Height (ft)
                <input value={feet} onChange={(e) => setHeight(e.target.value, inch)} />
              </label>
              <label>
                Inches
                <input value={inch} onChange={(e) => setHeight(feet, e.target.value)} />
              </label>
            </div>
            <label>
              Weight (kg)
              <input
                type="number"
                step="0.1"
                value={profile.weightKg}
                onChange={(e) => onChange({ weightKg: Number(e.target.value) })}
              />
            </label>
            <button className="btn primary" onClick={() => setStep(2)}>
              Next — kitchen & pool
            </button>
          </section>
        )}
        {step === 2 && (
          <section>
            <h2>How you actually live</h2>
            <label>
              Cups of cha a day
              <input
                type="number"
                min="0"
                max="12"
                value={profile.teaCups}
                onChange={(e) => onChange({ teaCups: Number(e.target.value) })}
              />
            </label>
            <label>
              Swim days / week
              <input
                type="number"
                min="0"
                max="7"
                value={profile.swimDays}
                onChange={(e) => onChange({ swimDays: Number(e.target.value) })}
              />
            </label>
            <label>
              Activity
              <select
                value={profile.activity}
                onChange={(e) => onChange({ activity: e.target.value })}
              >
                <option value="desk">Mostly sitting</option>
                <option value="light">Light walks</option>
                <option value="swim">Swimming 3–5 days (you)</option>
                <option value="heavy">Hard training</option>
              </select>
            </label>
            <label>
              Goal
              <select
                value={profile.goal}
                onChange={(e) => onChange({ goal: e.target.value })}
              >
                <option value="lose">Lose fat, keep muscle</option>
                <option value="maintain">Hold weight</option>
                <option value="gain">Gain</option>
              </select>
            </label>
            <button className="btn primary" onClick={() => setStep(3)}>
              Next — namaz location
            </button>
          </section>
        )}
        {step === 3 && (
          <section>
            <h2>Namaz by your sky</h2>
            <p className="muted">
              Times come from your GPS via Aladhan (Karachi method — usual in
              Bangladesh). Allow notifications so Fajr actually wakes you.
            </p>
            <button className="btn ghost" disabled={locBusy} onClick={onLocate}>
              {locBusy ? "Finding you…" : profile.city ? `Located: ${profile.city}` : "Use my location"}
            </button>
            {profile.lat && (
              <p className="tiny">
                {profile.lat.toFixed(3)}, {profile.lng.toFixed(3)}
              </p>
            )}
            <button className="btn primary" onClick={onDone}>
              Build my plan
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
      <p className="kicker gold">Ayah of the day · আয়াত</p>
      <p className="ayah-ar" dir="rtl" lang="ar">
        {ayah.ar}
      </p>
      {ayah.pron && <p className="ayah-pron">{ayah.pron}</p>}
      <p className="ayah-en">{ayah.en}</p>
      <p className="ayah-bn">{ayah.bn}</p>
      <cite>{ayah.ref}</cite>
    </article>
  );
}

function Home({ now, profile, prayer, tasks, water, doneMeals, doneNamaz, onWater, onTab, onIbadah }) {
  const b = bmi(profile.weightKg, profile.heightCm);
  const bl = bmiLabel(b);
  const kcal = targetCalories(profile);
  const target = targetWeightKg(profile.heightCm);
  const weeks = weeksToGoal(profile);
  const day = todayPlan(profile, now);
  const nxt = prayer ? nextPrayer(prayer.times, now) : null;
  const glasses = water[todayKey(now)] || 0;
  const openTasks = tasks.filter((t) => !t.done).length;
  const name = profile.name || "bhai";
  const prayed = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"].filter(
    (n) => doneNamaz?.[`${todayKey(now)}-${n}`]
  ).length;

  return (
    <main className="page">
      <header className="top">
        <div>
          <p className="kicker">Assalamu alaikum</p>
          <h1>{name}</h1>
        </div>
        <button className="chip ghost" type="button" onClick={() => onIbadah("hijri")}>
          {prayer?.hijri
            ? `${prayer.hijri.day} ${prayer.hijri.month.en}`
            : now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
        </button>
      </header>

      {nxt && (
        <button className="salah-card" onClick={() => onTab("namaz")}>
          <div>
            <p className="kicker gold">Next namaz</p>
            <h2>
              <span className="ar">{nxt.bangla}</span> {nxt.name}
            </h2>
            <p>{formatClock(nxt.at)}</p>
            <p className="tiny">{prayed}/5 prayed today</p>
          </div>
          <div className="count">{formatHms(nxt.at - now)}</div>
        </button>
      )}

      {prayer?.isRamadan && prayer.ramadan && (
        <section className="ramadan-home">
          <p className="kicker gold">রমজান · Ramadan</p>
          <div className="ramadan-pair">
            <article>
              <small>সাহরি শেষ</small>
              <strong>{prayer.ramadan.suhoorEnd}</strong>
              <em>Imsak</em>
            </article>
            <article>
              <small>ইফতার</small>
              <strong>{prayer.ramadan.iftar}</strong>
              <em>Maghrib</em>
            </article>
          </div>
          <button className="textish" onClick={() => onIbadah("hijri")}>
            Full Hijri calendar
          </button>
        </section>
      )}

      <AyahCard ayah={ayahOfDay(now)} />

      <div className="ibadah-row">
        <button type="button" onClick={() => onIbadah("quran")}>
          <b>কুরআন</b>
          10 minutes
        </button>
        <button type="button" onClick={() => onIbadah("qibla")}>
          <b>কিবলা</b>
          Compass
        </button>
        <button type="button" onClick={() => onIbadah("dua")}>
          <b>দোয়া</b>
          Search
        </button>
        <button type="button" onClick={() => onIbadah("hijri")}>
          <b>হিজরি</b>
          Calendar
        </button>
      </div>

      <section className="stats">
        <article>
          <small>BMI</small>
          <strong>{b.toFixed(1)}</strong>
          <em className={bl.tone}>{bl.text}</em>
        </article>
        <article>
          <small>Eat around</small>
          <strong>{kcal}</strong>
          <em>kcal / day</em>
        </article>
        <article>
          <small>Aim</small>
          <strong>{target}</strong>
          <em>kg · ~{weeks} wks</em>
        </article>
      </section>

      <section className="card">
        <div className="card-h">
          <h3>Today’s plate</h3>
          <button className="textish" onClick={() => onTab("eat")}>Full diet</button>
        </div>
        {day.isSwim && <p className="flag">Swim day — 1½ cup rice at lunch.</p>}
        <ul className="meals-mini">
          {day.meals.map((m) => {
            const done = doneMeals[`${todayKey(now)}-${m.id}`];
            return (
              <li key={m.id} className={done ? "done" : ""}>
                <span>{m.time}</span>
                <b>{m.slot}</b>
                <em>{m.title}</em>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <div className="card-h">
          <h3>Water · পানি</h3>
          <span>{glasses}/{WATER_GOAL} glasses</span>
        </div>
        <div className="glasses">
          {Array.from({ length: WATER_GOAL }, (_, i) => (
            <button
              key={i}
              className={i < glasses ? "full" : ""}
              onClick={() => onWater(i + 1 === glasses ? i : i + 1)}
              aria-label={`glass ${i + 1}`}
            />
          ))}
        </div>
      </section>

      <button className="card task-jump" onClick={() => onTab("tasks")}>
        <h3>Daily tasks</h3>
        <p>{openTasks ? `${openTasks} still open` : "All clear — add the next one."}</p>
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
        time: m.id === "suhoor" ? `until ${prayer.ramadan.suhoorEnd}` : prayer.ramadan.iftar,
      }))
    : null;

  return (
    <main className="page eat-page">
      <header className="top">
        <div>
          <p className="kicker">ঘরোয়া রান্না</p>
          <h1>Eat</h1>
        </div>
        <span className="chip">{plan.kcal} kcal</span>
      </header>
      <ul className="rules">
        {KITCHEN_RULES.map((r) => (
          <li key={r.en}>
            <b>{r.bn}</b>
            <span>{r.en}</span>
          </li>
        ))}
      </ul>
      <div className="seg">
        <button className={view === "today" ? "on" : ""} onClick={() => setView("today")}>Today</button>
        <button className={view === "week" ? "on" : ""} onClick={() => setView("week")}>Week</button>
        <button className={view === "bazaar" ? "on" : ""} onClick={() => setView("bazaar")}>Bazaar</button>
      </div>

      {view === "today" && ramadan && (
        <>
          <p className="flag">Ramadan — eat at Suhoor and Iftar only. Fast from Imsak to Maghrib.</p>
          {ramadanPlates.map((m) => {
            const done = doneMeals[`${todayKey()}-${m.id}`];
            return (
              <article key={m.id} className={`meal-card ${done ? "done" : ""}`}>
                <header>
                  <div>
                    <p className="kicker">{m.bangla} · {m.time}</p>
                    <h3>{m.slot}</h3>
                  </div>
                  <button className="check" onClick={() => onToggleMeal(m.id)}>
                    {done ? "✓" : "Eat"}
                  </button>
                </header>
                <ul className="food-chips">
                  {m.items.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
                <p className="muted">{m.note}</p>
              </article>
            );
          })}
        </>
      )}

      {view === "today" && !ramadan && (
        <>
          <p className="tea-line">
            Cha: {profile.teaCups} cups now → <b>{cha.week1}</b> this week, then {cha.after}. {cha.rule}
          </p>
          {today.isSwim && <p className="flag">Swim today — 1½ cup rice at lunch.</p>}
          {today.meals.map((m) => {
            const done = doneMeals[`${todayKey()}-${m.id}`];
            return (
              <article key={m.id} className={`meal-card ${done ? "done" : ""}`}>
                <header>
                  <div>
                    <p className="kicker">{m.bangla} · {m.time}</p>
                    <h3>{m.slot}</h3>
                  </div>
                  <button className="check" onClick={() => onToggleMeal(m.id)}>
                    {done ? "✓" : "Eat"}
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
                {d.day}
                {d.isSwim && <span className="swim">swim</span>}
              </h3>
              <p>{d.protein.name}</p>
              <small>{d.isSwim ? "1½ cup bhat" : "1 cup bhat"} · ruti at night</small>
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
  const prayed = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"].filter(
    (n) => doneNamaz?.[`${todayKey(now)}-${n}`]
  ).length;
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
            {hijri.day} {hijri.month.en} {hijri.year}
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
      {err && <p className="flag alert">{err}. Check location / network.</p>}
      {!profile.lat && (
        <button className="btn primary" onClick={onLocate}>
          Allow location for salah times
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
                  aria-label={done ? `${p.name} prayed` : `Mark ${p.name} prayed`}
                  onClick={() => {
                    onToggleNamaz(p.name);
                    if (!done && active) stopAlarm();
                  }}
                >
                  {done ? "✓" : ""}
                </button>
                <button type="button" className="salah-open" onClick={() => setGuide(p.name)}>
                  <span className="ar">{p.bangla}</span>
                  <b>{p.name}</b>
                  <time>{active ? formatHms(nxt.at - now) : p.clock}</time>
                </button>
              </li>
            );
          }
        )}
      </ol>
      <p className="tiny">{prayed} of 5 marked. Tap a name to see rakats. Tick the circle after you pray.</p>
      <section className="card namaz-settings">
        <label className="toggle">
          <input
            type="checkbox"
            checked={profile.notifyNamaz}
            onChange={(e) => onProfile({ notifyNamaz: e.target.checked })}
          />
          Alarm for all five
        </label>
        <label>
          Remind me
          <select
            value={profile.namazOffsetMin}
            onChange={(e) => onProfile({ namazOffsetMin: Number(e.target.value) })}
          >
            <option value="0">At the azan time</option>
            <option value="-10">10 min before</option>
            <option value="-5">5 min before</option>
          </select>
        </label>
        <button
          className="btn ghost"
          onClick={async () => {
            unlockAudio();
            await askNotify();
            fireNotify({
              title: "Fajr · ফজর",
              body: "Test alarm — phone should ring now.",
              tag: "test",
              sticky: true,
            });
          }}
        >
          Test full alarm
        </button>
        <p className="tiny">
          Allow notifications, Alarms & reminders, and Unrestricted battery.
          Then tap Test — you should hear the siren. Keep Hayat installed; do
          not force-stop it.
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
          <h1>Reminders</h1>
        </div>
      </header>
      <form className="card add-task" onSubmit={add}>
        <input
          value={title}
          placeholder="e.g. Swim 45 min, call Ammu"
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="row">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          <input
            value={note}
            placeholder="Optional note"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <button className="btn primary" type="submit">
          Add task
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
              aria-label="toggle"
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
              aria-label="delete"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {tasks.length === 0 && <p className="muted">Nothing yet. Add the next thing.</p>}
    </main>
  );
}

function Me({ profile, onProfile, onLocate, locBusy, onReset }) {
  const ft = ftInFromCm(profile.heightCm);
  const [feet, setFeet] = useState(String(ft.ftAdj ?? ft.ft));
  const [inch, setInch] = useState(String(ft.inch));
  const b = bmi(profile.weightKg, profile.heightCm);

  return (
    <main className="page">
      <header className="top">
        <div>
          <p className="kicker">প্রোফাইল</p>
          <h1>You</h1>
        </div>
      </header>
      <p className="lede">
        BMI {b.toFixed(1)}. Target ~{targetWeightKg(profile.heightCm)} kg.
      </p>
      <section className="card stack">
        <label>
          Name
          <input value={profile.name} onChange={(e) => onProfile({ name: e.target.value })} />
        </label>
        <div className="row">
          <label>
            Age
            <input type="number" value={profile.age} onChange={(e) => onProfile({ age: Number(e.target.value) })} />
          </label>
          <label>
            Weight kg
            <input type="number" step="0.1" value={profile.weightKg} onChange={(e) => onProfile({ weightKg: Number(e.target.value) })} />
          </label>
        </div>
        <div className="row">
          <label>
            Height ft
            <input
              value={feet}
              onChange={(e) => {
                setFeet(e.target.value);
                onProfile({ heightCm: cmFromFtIn(e.target.value, inch) });
              }}
            />
          </label>
          <label>
            In
            <input
              value={inch}
              onChange={(e) => {
                setInch(e.target.value);
                onProfile({ heightCm: cmFromFtIn(feet, e.target.value) });
              }}
            />
          </label>
        </div>
        <div className="row">
          <label>
            Cha cups
            <input type="number" value={profile.teaCups} onChange={(e) => onProfile({ teaCups: Number(e.target.value) })} />
          </label>
          <label>
            Swim days
            <input type="number" value={profile.swimDays} onChange={(e) => onProfile({ swimDays: Number(e.target.value) })} />
          </label>
        </div>
      </section>
      <section className="card stack">
        <label className="toggle">
          <input type="checkbox" checked={profile.notifyMeals} onChange={(e) => onProfile({ notifyMeals: e.target.checked })} />
          Meal notifications
        </label>
        <label className="toggle">
          <input type="checkbox" checked={profile.notifyTasks} onChange={(e) => onProfile({ notifyTasks: e.target.checked })} />
          Task notifications
        </label>
        <label className="toggle">
          <input type="checkbox" checked={profile.notifyNamaz} onChange={(e) => onProfile({ notifyNamaz: e.target.checked })} />
          Namaz alarms
        </label>
      </section>
      <button className="btn ghost" disabled={locBusy} onClick={onLocate}>
        Refresh location {profile.city && `· ${profile.city}`}
      </button>
      <button
        className="btn ghost"
        onClick={async () => {
          const p = await askNotify();
          playChime("meal");
          if (p === "granted") fireNotify({ title: "Hayat", body: "Notifications are on.", tag: "ok" });
        }}
      >
        Test notifications
      </button>
      <button className="btn danger" onClick={onReset}>
        Start over
      </button>
    </main>
  );
}
