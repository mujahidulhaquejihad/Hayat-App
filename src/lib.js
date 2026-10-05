import { Capacitor, registerPlugin } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { LocalNotifications } from "@capacitor/local-notifications";

const HayatNative = registerPlugin("HayatNative");
const NAMAZ_CHANNEL = "hayat-namaz";
let nativeListen = false;

function isNative() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

function nid(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (Math.abs(h) % 900000) + 1000;
}

function listenNativeAlarms() {
  if (nativeListen || !isNative()) return;
  nativeListen = true;
  LocalNotifications.addListener("localNotificationReceived", (n) => {
    const extra = n.extra || {};
    if (extra.kind === "namaz" || extra.sticky) {
      startAlarm({ title: n.title, body: n.body, tag: String(n.id) });
    }
  });
  LocalNotifications.addListener("localNotificationActionPerformed", (e) => {
    if (e.actionId === "dismiss" || e.actionId === "stop") {
      stopAlarm();
      return;
    }
    const n = e.notification || {};
    const extra = n.extra || {};
    if (extra.kind === "namaz" || extra.sticky) {
      startAlarm({ title: n.title, body: n.body, tag: String(n.id) });
    }
  });
}

async function scheduleNative(items) {
  if (!isNative()) return;
  const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] }));
  const ours = (pending.notifications || []).filter((n) => n.id >= 1000 && n.id < 901000);
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  const now = Date.now();
  const notifications = items
    .filter((it) => it.at.getTime() > now && it.at.getTime() - now < 36 * 3600 * 1000)
    .map((it) => {
      const namaz = it.sticky || it.kind === "namaz";
      return {
        id: nid(it.id),
        title: it.title,
        body: it.body,
        schedule: { at: it.at, allowWhileIdle: true },
        channelId: namaz ? NAMAZ_CHANNEL : undefined,
        extra: { kind: it.kind, sticky: Boolean(it.sticky) },
        ongoing: namaz,
        autoCancel: !namaz,
        sound: namaz ? "alarm.wav" : undefined,
      };
    });
  if (!notifications.length) return;
  await LocalNotifications.schedule({ notifications });
}

const KEY = "hayat.v1";

export const defaultProfile = {
  name: "",
  sex: "male",
  age: 28,
  heightCm: 178,
  weightKg: 95,
  teaCups: 5,
  swimDays: 4,
  activity: "swim",
  goal: "lose",
  city: "",
  lat: null,
  lng: null,
  prayerMethod: 1,
  notifyNamaz: true,
  notifyMeals: true,
  notifyTasks: true,
  namazOffsetMin: 0,
  mealReminders: true,
};

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const s = JSON.parse(raw);
    return {
      ...emptyState(),
      ...s,
      profile: { ...defaultProfile, ...(s.profile || {}) },
      tasks: Array.isArray(s.tasks) ? s.tasks : [],
      doneMeals: s.doneMeals || {},
      doneNamaz: s.doneNamaz || {},
      water: s.water || {},
    };
  } catch {
    return emptyState();
  }
}

function emptyState() {
  return {
    onboarded: false,
    profile: { ...defaultProfile },
    tasks: [],
    doneMeals: {},
    doneNamaz: {},
    water: {},
    quranPage: 1,
  };
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function cmFromFtIn(ft, inch) {
  return Math.round((Number(ft) * 12 + Number(inch)) * 2.54);
}

export function ftInFromCm(cm) {
  const total = cm / 2.54;
  const ft = Math.floor(total / 12);
  const inch = Math.round(total - ft * 12);
  return { ft, inch: inch === 12 ? 0 : inch, ftAdj: inch === 12 ? ft + 1 : ft };
}

export function bmi(kg, cm) {
  const m = cm / 100;
  return kg / (m * m);
}

export function bmiLabel(v) {
  if (v < 18.5) return { text: "Underweight", tone: "warn" };
  if (v < 25) return { text: "Healthy", tone: "good" };
  if (v < 30) return { text: "Overweight", tone: "warn" };
  return { text: "Obese range", tone: "alert" };
}

export function bmr({ sex, kg, cm, age }) {
  const s = sex === "female" ? -161 : 5;
  return 10 * kg + 6.25 * cm - 5 * age + s;
}

const ACTIVITY = { desk: 1.2, light: 1.375, swim: 1.55, heavy: 1.725 };

export function tdee(profile) {
  const r = bmr({
    sex: profile.sex,
    kg: profile.weightKg,
    cm: profile.heightCm,
    age: profile.age,
  });
  return r * (ACTIVITY[profile.activity] || 1.55);
}

export function targetCalories(profile) {
  const t = tdee(profile);
  const floor = profile.sex === "female" ? 1500 : 1800;
  if (profile.goal === "maintain") return Math.round(t);
  if (profile.goal === "gain") return Math.round(t + 250);
  return Math.max(floor, Math.round(t - 550));
}

export function targetWeightKg(cm) {
  return Math.round(22.5 * (cm / 100) ** 2);
}

export function weeksToGoal(profile) {
  const target = targetWeightKg(profile.heightCm);
  const diff = profile.weightKg - target;
  if (diff <= 0) return 0;
  return Math.ceil(diff / 0.5);
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const PROTEIN = [
  { name: "ডিম + ডাল", plate: "2 eggs + thick dal", kcal: 220 },
  { name: "মাছ", plate: "small rui / tilapia jhol (not fry)", kcal: 280 },
  { name: "মুরগি", plate: "2 pcs chicken jhol", kcal: 300 },
  { name: "ডিম তরকারি", plate: "2-egg curry, little oil", kcal: 240 },
  { name: "মাছ", plate: "fish jhol", kcal: 280 },
  { name: "মুরগি", plate: "chicken jhol", kcal: 300 },
  { name: "খিচুড়ি", plate: "small mug-dal khichuri", kcal: 320 },
];

export function chaPlan(cupsNow) {
  const n = Number(cupsNow) || 5;
  return {
    week1: Math.max(3, n - 1),
    week2: 3,
    after: 2,
    rule: "No sugar. No biscuit. Last cup before Maghrib.",
  };
}

export function groceryList() {
  return [
    { group: "Always at home", items: ["Atta for ruti", "Chal — 1 cup cooked at lunch", "Masoor dal", "Eggs", "Cha pata"] },
    { group: "Protein this week", items: ["Fish 3 days", "Chicken 2 days", "Eggs the rest", "Dahi if you find it"] },
    { group: "Bazaar sabji", items: ["Lau / jhinge / dherosh", "Shak (palong or pui)", "Tomato, cucumber, lemon", "Onion, garlic, ginger"] },
    { group: "Snack", items: ["Kola or guava", "Skip the biscuit tin"] },
  ];
}

export const KITCHEN_RULES = [
  { bn: "দুপুরে ১ কাপ ভাত", en: "1 cup rice at lunch only" },
  { bn: "রাতে রুটি, ভাত নয়", en: "Ruti at night, no bhat" },
  { bn: "চা ২ কাপ, চিনি নয়", en: "2 cups cha, no sugar" },
  { bn: "তেল ১ চামচ", en: "1 tsp oil in the curry" },
];

export function weeklyPlan(profile) {
  const kcal = targetCalories(profile);
  const swim = Number(profile.swimDays) || 0;
  const swimIdx = swim >= 4 ? [1, 3, 5, 6] : swim >= 2 ? [2, 5] : [];
  const days = DAYS.map((d, i) => {
    const isSwim = swimIdx.includes(i);
    const protein = PROTEIN[i];
    const khichuri = i === 6;
    const rice = isSwim ? "1½ cup bhat" : "1 cup bhat";
    const meals = [
      {
        id: "breakfast",
        slot: "Breakfast",
        bangla: "নাস্তা",
        time: "07:30",
        title: "2 ruti + 2 eggs + tomato-cucumber",
        items: ["২ রুটি", "২ ডিম", "টমেটো-শসা"],
        note: "Leftover ruti is fine. No biscuit with cha.",
        kcal: 430,
        protein: 22,
      },
      {
        id: "lunch",
        slot: "Lunch",
        bangla: "দুপুর",
        time: "13:30",
        title: khichuri
          ? "Small khichuri + salad + doi"
          : `${rice} + dal + sabji + ${protein.plate}`,
        items: khichuri
          ? ["খিচুড়ি", "সালাদ", "দই"]
          : [isSwim ? "দেড় কাপ ভাত" : "১ কাপ ভাত", "ডাল", "সবজি", protein.name],
        note: isSwim ? "Swim day — the extra rice is earned." : "One plate. Don't refill the rice.",
        kcal: khichuri ? 620 : isSwim ? 780 : 680,
        protein: 32,
      },
      {
        id: "snack",
        slot: "Cha",
        bangla: "চা",
        time: "17:00",
        title: "Unsweetened cha + 1 banana or guava",
        items: ["চা (চিনি ছাড়া)", "১ কলা"],
        note: "Fruit is the snack. Count this as one cha.",
        kcal: 130,
        protein: 2,
      },
      {
        id: "dinner",
        slot: "Dinner",
        bangla: "রাত",
        time: "20:00",
        title: "2 ruti + leftover curry or 1 egg + salad",
        items: ["২ রুটি", "বাড়তি তরকারি / ডিম", "সালাদ"],
        note: "Finish 1 hour before sleep. Still hungry? One extra ruti or doi — not rice.",
        kcal: 480,
        protein: 24,
      },
    ];
    const dayKcal = meals.reduce((a, m) => a + m.kcal, 0);
    return { day: d, i, isSwim, protein, meals, dayKcal, target: kcal };
  });
  return { kcal, days, cha: chaPlan(profile.teaCups), grocery: groceryList(), rules: KITCHEN_RULES };
}

export function todayPlan(profile, date = new Date()) {
  const w = weeklyPlan(profile);
  return w.days[date.getDay()];
}

export const WATER_GOAL = 10;

export function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export const KAABA = { lat: 21.4225, lng: 39.8262 };

export function qiblaBearing(lat, lng) {
  const φ1 = (lat * Math.PI) / 180;
  const φ2 = (KAABA.lat * Math.PI) / 180;
  const Δλ = ((KAABA.lng - lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function compassDelta(heading, qibla) {
  let d = ((qibla - heading + 540) % 360) - 180;
  return d;
}

export async function fetchQuranPage(page) {
  const p = Math.min(604, Math.max(1, Number(page) || 1));
  const [ar, bn, tr] = await Promise.all([
    fetch(`https://api.alquran.cloud/v1/page/${p}/quran-uthmani`).then((r) => r.json()),
    fetch(`https://api.alquran.cloud/v1/page/${p}/bn.bengali`).then((r) => r.json()),
    fetch(`https://api.alquran.cloud/v1/page/${p}/en.transliteration`).then((r) => r.json()),
  ]);
  if (ar.code !== 200 || bn.code !== 200) throw new Error("Quran could not load");
  const ayahs = ar.data.ayahs.map((a, i) => ({
    key: a.number,
    surah: a.surah.englishName,
    surahBn: a.surah.name,
    surahNo: a.surah.number,
    ayah: a.numberInSurah,
    ar: a.text,
    pron: tr.code === 200 ? tr.data.ayahs[i]?.text || "" : "",
    bn: bn.data.ayahs[i]?.text || "",
  }));
  return { page: p, ayahs, surah: ayahs[0]?.surah || "" };
}

export async function getPosition() {
  if (isNative()) {
    await Geolocation.requestPermissions();
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 });
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("No GPS"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 12000 }
    );
  });
}

export async function reverseCity(lat, lng) {
  const u = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
  const r = await fetch(u, { headers: { Accept: "application/json" } });
  if (!r.ok) return "";
  const j = await r.json();
  const a = j.address || {};
  return a.city || a.town || a.village || a.state || j.display_name?.split(",")[0] || "";
}

const PRAYER_ORDER = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
export const PRAYER_BN = {
  Fajr: "ফজর",
  Dhuhr: "যোহর",
  Asr: "আসর",
  Maghrib: "মাগরিব",
  Isha: "এশা",
};

export const AYAT = [
  {
    ar: "فَإِنَّ مَعَ الْعُسْرِ يُسْرًا ۝ إِنَّ مَعَ الْعُسْرِ يُسْرًا",
    pron: "Fa-inna ma'al-'usri yusra. Inna ma'al-'usri yusra.",
    en: "For indeed, with hardship comes ease. Indeed, with hardship comes ease.",
    bn: "নিশ্চয়ই কষ্টের সাথে স্বস্তি আছে। নিশ্চয়ই কষ্টের সাথে স্বস্তি আছে।",
    ref: "Ash-Sharh 94:5–6",
  },
  {
    ar: "يَا أَيُّهَا الَّذِينَ آمَنُوا اسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ ۚ إِنَّ اللَّهَ مَعَ الصَّابِرِينَ",
    pron: "Yaa ayyuhal-ladheena aamanus-ta'eenoo bis-sabri was-salaah. Innallaha ma'as-saabireen.",
    en: "O you who believe, seek help through patience and prayer. Indeed, Allah is with the patient.",
    bn: "হে মুমিনগণ, ধৈর্য ও সালাতের মাধ্যমে সাহায্য চাও। নিশ্চয়ই আল্লাহ ধৈর্যশীলদের সাথে আছেন।",
    ref: "Al-Baqarah 2:153",
  },
  {
    ar: "إِنَّ اللَّهَ لَا يُغَيِّرُ مَا بِقَوْمٍ حَتَّىٰ يُغَيِّرُوا مَا بِأَنفُسِهِمْ",
    pron: "Innallaha laa yughayyiru maa bi-qawmin hattaa yughayyiroo maa bi-anfusihim.",
    en: "Indeed, Allah will not change the condition of a people until they change what is in themselves.",
    bn: "আল্লাহ কোনো জাতির অবস্থা পরিবর্তন করেন না, যতক্ষণ না তারা নিজেদের অবস্থা পরিবর্তন করে।",
    ref: "Ar-Ra'd 13:11",
  },
  {
    ar: "لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا",
    pron: "Laa yukallifullahu nafsan illaa wus'ahaa.",
    en: "Allah does not burden a soul except with that within its capacity.",
    bn: "আল্লাহ কাউকে তার সাধ্যের অতিরিক্ত বোঝা দেন না।",
    ref: "Al-Baqarah 2:286",
  },
  {
    ar: "وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ",
    pron: "Wa man yatawakkal 'alallahi fa-huwa hasbuh.",
    en: "And whoever relies upon Allah — then He is sufficient for him.",
    bn: "যে আল্লাহর উপর ভরসা করে, তিনিই তার জন্য যথেষ্ট।",
    ref: "At-Talaq 65:3",
  },
  {
    ar: "وَلَا تَهِنُوا وَلَا تَحْزَنُوا وَأَنتُمُ الْأَعْلَوْنَ إِن كُنتُم مُّؤْمِنِينَ",
    pron: "Wa laa tahinoo wa laa tahzanoo wa antumul-a'lawna in kuntum mu'mineen.",
    en: "Do not weaken and do not grieve, and you will be superior if you are [true] believers.",
    bn: "দূর্বল হয়ো না, দুঃখিত হয়ো না। তোমরাই শ্রেষ্ঠ, যদি তোমরা মুমিন হও।",
    ref: "Aal-Imran 3:139",
  },
  {
    ar: "وَكُلُوا وَاشْرَبُوا وَلَا تُسْرِفُوا ۚ إِنَّهُ لَا يُحِبُّ الْمُسْرِفِينَ",
    pron: "Wa kuloo washraboo wa laa tusrifoo. Innahu laa yuhibbul-musrifeen.",
    en: "Eat and drink, but be not excessive. Indeed, He does not like those who commit excess.",
    bn: "খাও ও পান করো, কিন্তু অপচয় করো না। তিনি অপচয়কারীদের পছন্দ করেন না।",
    ref: "Al-A'raf 7:31",
  },
  {
    ar: "أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ",
    pron: "Alaa bi-dhikrillahi tatma'innul-quloob.",
    en: "Unquestionably, by the remembrance of Allah hearts are assured.",
    bn: "জেনে রাখো, আল্লাহর স্মরণেই অন্তর প্রশান্ত হয়।",
    ref: "Ar-Ra'd 13:28",
  },
  {
    ar: "فَاذْكُرُونِي أَذْكُرْكُمْ وَاشْكُرُوا لِي وَلَا تَكْفُرُونِ",
    pron: "Fadh-kuroonee adh-kurkum washkuroo lee wa laa takfuroon.",
    en: "So remember Me; I will remember you. And be grateful to Me and do not deny Me.",
    bn: "তোমরা আমাকে স্মরণ করো, আমি তোমাদের স্মরণ করব। আমার প্রতি কৃতজ্ঞ হও, অকৃতজ্ঞ হয়ো না।",
    ref: "Al-Baqarah 2:152",
  },
  {
    ar: "وَالَّذِينَ جَاهَدُوا فِينَا لَنَهْدِيَنَّهُمْ سُبُلَنَا",
    pron: "Wal-ladheena jaahadoo feenaa la-nahdiyannahum subulanaa.",
    en: "And those who strive for Us — We will surely guide them to Our ways.",
    bn: "যারা আমার পথে সাধনা করে, আমি অবশ্যই তাদের আমার পথ দেখাব।",
    ref: "Al-Ankabut 29:69",
  },
  {
    ar: "لَا تَقْنَطُوا مِن رَّحْمَةِ اللَّهِ ۚ إِنَّ اللَّهَ يَغْفِرُ الذُّنُوبَ جَمِيعًا",
    pron: "Laa taqnatoo min rahmatillah. Innallaha yaghfirudh-dhunooba jamee'a.",
    en: "Do not despair of the mercy of Allah. Indeed, Allah forgives all sins.",
    bn: "আল্লাহর রহমত থেকে নিরাশ হয়ো না। নিশ্চয়ই আল্লাহ সব গুনাহ ক্ষমা করেন।",
    ref: "Az-Zumar 39:53",
  },
  {
    ar: "وَأَن لَّيْسَ لِلْإِنسَانِ إِلَّا مَا سَعَىٰ",
    pron: "Wa an laysa lil-insaani illaa maa sa'aa.",
    en: "And that there is not for man except that [good] for which he strives.",
    bn: "মানুষ যা চেষ্টা করে, কেবল তাই তার জন্য।",
    ref: "An-Najm 53:39",
  },
  {
    ar: "لَئِن شَكَرْتُمْ لَأَزِيدَنَّكُمْ",
    pron: "La-in shakartum la-azeedannakum.",
    en: "If you are grateful, I will surely increase you [in favor].",
    bn: "যদি তোমরা কৃতজ্ঞ হও, আমি অবশ্যই তোমাদের আরও দেব।",
    ref: "Ibrahim 14:7",
  },
  {
    ar: "وَمَن يَتَّقِ اللَّهَ يَجْعَل لَّهُ مَخْرَجًا",
    pron: "Wa man yattaqillaha yaj'al lahu makhrajaa.",
    en: "And whoever fears Allah — He will make for him a way out.",
    bn: "যে আল্লাহকে ভয় করে, তিনি তার জন্য নিষ্কৃতির পথ করে দেন।",
    ref: "At-Talaq 65:2",
  },
  {
    ar: "فَإِذَا فَرَغْتَ فَانصَبْ ۝ وَإِلَىٰ رَبِّكَ فَارْغَبْ",
    pron: "Fa-idhaa faraghta fansab. Wa ilaa rabbika farghab.",
    en: "So when you have finished [your duties], then stand up [for worship]. And to your Lord direct your longing.",
    bn: "কাজ শেষ হলে ইবাদতে দাঁড়াও। আর তোমার রবের দিকে মনোযোগ দাও।",
    ref: "Ash-Sharh 94:7–8",
  },
  {
    ar: "حَافِظُوا عَلَى الصَّلَوَاتِ وَالصَّلَاةِ الْوُسْطَىٰ",
    pron: "Haafizoo 'alas-salawaati was-salaatil-wustaa.",
    en: "Maintain with care the prayers, and [especially] the middle prayer.",
    bn: "সালাতসমূহ হিফাজত করো, বিশেষ করে মধ্যবর্তী সালাত।",
    ref: "Al-Baqarah 2:238",
  },
  {
    ar: "إِنَّنِي أَنَا اللَّهُ لَا إِلَٰهَ إِلَّا أَنَا فَاعْبُدْنِي وَأَقِمِ الصَّلَاةَ لِذِكْرِي",
    pron: "Innanee anal-laahu laa ilaaha illaa ana fa'budnee wa aqimis-salaata li-dhikree.",
    en: "Indeed, I am Allah. There is no deity except Me, so worship Me and establish prayer for My remembrance.",
    bn: "আমিই আল্লাহ, আমি ছাড়া কোনো ইলাহ নেই। আমার ইবাদত করো এবং আমার স্মরণে সালাত কায়েম করো।",
    ref: "Ta-Ha 20:14",
  },
  {
    ar: "فَمَن يَعْمَلْ مِثْقَالَ ذَرَّةٍ خَيْرًا يَرَهُ",
    pron: "Fa-man ya'mal mithqaala dharratin khayran yarah.",
    en: "So whoever does an atom's weight of good will see it.",
    bn: "কেউ অণু পরিমাণ নেক আমল করলে তা দেখতে পাবে।",
    ref: "Az-Zalzalah 99:7",
  },
  {
    ar: "وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ",
    pron: "Wa maa tawfeeqee illaa billah.",
    en: "And my success is not but through Allah.",
    bn: "আমার সাফল্য কেবল আল্লাহর পক্ষ থেকেই।",
    ref: "Hud 11:88",
  },
  {
    ar: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ",
    pron: "Rabbanaa aatinaa fid-dunyaa hasanatan wa fil-aakhirati hasanatan wa qinaa 'adhaaban-naar.",
    en: "Our Lord, give us good in this world and good in the Hereafter, and protect us from the punishment of the Fire.",
    bn: "হে আমাদের রব, আমাদের দুনিয়াতে কল্যাণ দাও, আখিরাতে কল্যাণ দাও, আর আগুনের আজাব থেকে রক্ষা করো।",
    ref: "Al-Baqarah 2:201",
  },
  {
    ar: "إِنَّ أَكْرَمَكُمْ عِندَ اللَّهِ أَتْقَاكُمْ",
    pron: "Inna akramakum 'indallahi atqaakum.",
    en: "Indeed, the most noble of you in the sight of Allah is the most righteous of you.",
    bn: "আল্লাহর কাছে তোমাদের মধ্যে সবচেয়ে সম্মানিত সেই, যে সবচেয়ে বেশি মুত্তাকি।",
    ref: "Al-Hujurat 49:13",
  },
  {
    ar: "وَهُوَ مَعَكُمْ أَيْنَ مَا كُنتُمْ",
    pron: "Wa huwa ma'akum ayna maa kuntum.",
    en: "And He is with you wherever you are.",
    bn: "তোমরা যেখানেই থাকো, তিনি তোমাদের সাথে আছেন।",
    ref: "Al-Hadid 57:4",
  },
  {
    ar: "وَكُلُوا مِمَّا رَزَقَكُمُ اللَّهُ حَلَالًا طَيِّبًا ۚ وَاتَّقُوا اللَّهَ",
    pron: "Wa kuloo mimmaa razaqakumullahu halaalan tayyibaa. Wattaqullah.",
    en: "And eat of what Allah has provided for you, lawful and good. And fear Allah.",
    bn: "আল্লাহ তোমাদের যে হালাল ও পবিত্র রিজিক দিয়েছেন, তা থেকে খাও। আর আল্লাহকে ভয় করো।",
    ref: "Al-Ma'idah 5:88",
  },
  {
    ar: "قَدْ أَفْلَحَ الْمُؤْمِنُونَ ۝ الَّذِينَ هُمْ فِي صَلَاتِهِمْ خَاشِعُونَ",
    pron: "Qad aflahal-mu'minoon. Alladheena hum fee salaatihim khaashi'oon.",
    en: "Successful indeed are the believers — those who humble themselves in their prayer.",
    bn: "মুমিনরা সফল — যারা তাদের সালাতে বিনীত।",
    ref: "Al-Mu'minun 23:1–2",
  },
  {
    ar: "وَاعْبُدْ رَبَّكَ حَتَّىٰ يَأْتِيَكَ الْيَقِينُ",
    pron: "Wa'bud rabbaka hattaa ya'tiyakal-yaqeen.",
    en: "And worship your Lord until there comes to you the certainty [of death].",
    bn: "তোমার রবের ইবাদত করতে থাকো, যতক্ষণ না নিশ্চিত বিষয় (মৃত্যু) এসে যায়।",
    ref: "Al-Hijr 15:99",
  },
  {
    ar: "وَاسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ ۚ وَإِنَّهَا لَكَبِيرَةٌ إِلَّا عَلَى الْخَاشِعِينَ",
    pron: "Wasta'eenoo bis-sabri was-salaah. Wa innahaa la-kabeeratun illaa 'alal-khaashi'een.",
    en: "And seek help through patience and prayer, and indeed, it is difficult except for the humbly submissive.",
    bn: "ধৈর্য ও সালাতের মাধ্যমে সাহায্য চাও। এটি কঠিন, তবে বিনীতদের জন্য নয়।",
    ref: "Al-Baqarah 2:45",
  },
  {
    ar: "وَالْبَاقِيَاتُ الصَّالِحَاتُ خَيْرٌ عِندَ رَبِّكَ ثَوَابًا وَخَيْرٌ أَمَلًا",
    pron: "Wal-baaqiyaatus-saalihaatu khayrun 'inda rabbika thawaaban wa khayrun amalaa.",
    en: "But the enduring good deeds are better with your Lord for reward and better for [one's] hope.",
    bn: "স্থায়ী নেক আমলই তোমার রবের কাছে প্রতিদান ও আশায় উত্তম।",
    ref: "Al-Kahf 18:46",
  },
  {
    ar: "مَنْ عَمِلَ صَالِحًا مِّن ذَكَرٍ أَوْ أُنثَىٰ وَهُوَ مُؤْمِنٌ فَلَنُحْيِيَنَّهُ حَيَاةً طَيِّبَةً",
    pron: "Man 'amila saalihan min dhakarin aw unthaa wa huwa mu'minun fa-lanuhyiyannahu hayaatan tayyibah.",
    en: "Whoever does righteousness, whether male or female, while a believer — We will surely cause them to live a good life.",
    bn: "যে ঈমানদার হয়ে নেক আমল করে, পুরুষ হোক বা নারী, আমি তাকে উত্তম জীবন দান করব।",
    ref: "An-Nahl 16:97",
  },
  {
    ar: "فَإِذَا عَزَمْتَ فَتَوَكَّلْ عَلَى اللَّهِ ۚ إِنَّ اللَّهَ يُحِبُّ الْمُتَوَكِّلِينَ",
    pron: "Fa-idhaa 'azamta fa-tawakkal 'alallah. Innallaha yuhibbul-mutawakkileen.",
    en: "Then when you have decided, rely upon Allah. Indeed, Allah loves those who rely [upon Him].",
    bn: "যখন সিদ্ধান্ত নিয়েছ, আল্লাহর উপর ভরসা করো। আল্লাহ তাওয়াক্কুলকারীদের ভালোবাসেন।",
    ref: "Aal-Imran 3:159",
  },
  {
    ar: "وَمَا خَلَقْتُ الْجِنَّ وَالْإِنسَ إِلَّا لِيَعْبُدُونِ",
    pron: "Wa maa khalaqtul-jinna wal-insa illaa li-ya'budoon.",
    en: "And I did not create the jinn and mankind except to worship Me.",
    bn: "আমি জিন ও মানুষকে কেবল আমার ইবাদতের জন্যই সৃষ্টি করেছি।",
    ref: "Adh-Dhariyat 51:56",
  },
];

export function ayahOfDay(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 1);
  const day = Math.floor((d - start) / 86400000);
  return AYAT[((day % AYAT.length) + AYAT.length) % AYAT.length];
}

export async function fetchPrayerTimes(lat, lng, method = 1, date = new Date()) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = date.getFullYear();
  const url = `https://api.aladhan.com/v1/timings/${dd}-${mm}-${yy}?latitude=${lat}&longitude=${lng}&method=${method}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Prayer API failed");
  const j = await r.json();
  const t = j.data.timings;
  return {
    date: j.data.date,
    hijri: j.data.date.hijri,
    times: PRAYER_ORDER.map((name) => ({
      name,
      bangla: PRAYER_BN[name],
      clock: t[name].slice(0, 5),
    })),
    sunrise: t.Sunrise?.slice(0, 5),
    imsak: t.Imsak?.slice(0, 5),
    ramadan: ramadanTimesFromTimings(t),
    isRamadan: Number(j.data.date.hijri.month.number) === 9,
  };
}

export const HIJRI_BN = {
  1: "মুহাররম",
  2: "সফর",
  3: "রবিউল আউয়াল",
  4: "রবিউস সানি",
  5: "জমাদিউল আউয়াল",
  6: "জমাদিউস সানি",
  7: "রজব",
  8: "শাবান",
  9: "রমজান",
  10: "শাওয়াল",
  11: "জিলকদ",
  12: "জিলহজ",
};

export function isRamadan(hijri) {
  return Number(hijri?.month?.number) === 9;
}

export function shiftHijri(month, year, delta) {
  let m = Number(month) + delta;
  let y = Number(year);
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { month: m, year: y };
}

export function minusMinutes(hhmm, mins) {
  const [h, m] = String(hhmm)
    .slice(0, 5)
    .split(":")
    .map(Number);
  const wrap = (((h * 60 + m - mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrap / 60)).padStart(2, "0")}:${String(wrap % 60).padStart(2, "0")}`;
}

export function ramadanTimesFromTimings(t) {
  const fajr = String(t.Fajr || t.fajr || "").slice(0, 5);
  const maghrib = String(t.Maghrib || t.maghrib || "").slice(0, 5);
  const imsak = String(t.Imsak || t.imsak || fajr).slice(0, 5);
  return {
    imsak,
    fajr,
    maghrib,
    suhoorStart: minusMinutes(imsak, 45),
    suhoorEnd: imsak,
    iftar: maghrib,
  };
}

export const RAMADAN_MEALS = [
  {
    id: "suhoor",
    slot: "Suhoor",
    bangla: "সাহরি",
    items: ["খেজুর", "২ রুটি", "ডিম", "পানি / দই"],
    title: "Dates + 2 ruti + egg + water",
    note: "Finish before Imsak. Don't skip water.",
  },
  {
    id: "iftar",
    slot: "Iftar",
    bangla: "ইফতার",
    items: ["৩ খেজুর", "পানি", "ফল / ছোলা"],
    title: "Dates and water first, then fruit or chhola",
    note: "Pray Maghrib, then a normal plate — not a feast.",
  },
];

const WEEKDAY_SAT = {
  Saturday: 0,
  Sunday: 1,
  Monday: 2,
  Tuesday: 3,
  Wednesday: 4,
  Thursday: 5,
  Friday: 6,
};

export async function fetchHijriMonth({ lat, lng, month, year, method = 1 }) {
  const url = `https://api.aladhan.com/v1/hijriCalendar/${month}/${year}?latitude=${lat}&longitude=${lng}&method=${method}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Hijri calendar failed");
  const j = await r.json();
  const days = (j.data || []).map((d) => {
    const h = d.date.hijri;
    const g = d.date.gregorian;
    return {
      hijriDay: Number(h.day),
      hijriMonth: Number(h.month.number),
      hijriYear: Number(h.year),
      gregorian: `${Number(g.day)} ${g.month.en.slice(0, 3)}`,
      weekday: g.weekday.en,
      pad: WEEKDAY_SAT[g.weekday.en] ?? 0,
      holidays: h.holidays || [],
      ...ramadanTimesFromTimings(d.timings),
    };
  });
  return {
    month: Number(month),
    year: Number(year),
    name: days[0] ? HIJRI_BN[Number(month)] : "",
    isRamadan: Number(month) === 9,
    days,
  };
}

export function parseClock(clock, on = new Date()) {
  const [h, m] = clock.split(":").map(Number);
  const d = new Date(on);
  d.setHours(h, m, 0, 0);
  return d;
}

export function nextPrayer(times, now = new Date()) {
  for (const p of times) {
    const at = parseClock(p.clock, now);
    if (at > now) return { ...p, at };
  }
  const fajr = times[0];
  const at = parseClock(fajr.clock, now);
  at.setDate(at.getDate() + 1);
  return { ...fajr, at };
}

export function formatHms(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

export function formatClock(d) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

let swReg = null;
export async function registerSW() {
  if (isNative()) return null;
  if (!("serviceWorker" in navigator)) return null;
  swReg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  return swReg;
}

export async function askNotify() {
  if (isNative()) {
    listenNativeAlarms();
    try {
      await HayatNative.prepareAlarms();
    } catch {
      /* web stub */
    }
    try {
      await Geolocation.requestPermissions();
    } catch {
      /* denied / missing */
    }
    const perm = await LocalNotifications.requestPermissions();
    try {
      const exact = await LocalNotifications.checkExactNotificationSetting();
      if (exact.exact_alarm !== "granted" && !window.__hayatExactAsked) {
        window.__hayatExactAsked = true;
        await LocalNotifications.changeExactNotificationSetting();
      }
    } catch {
      /* older Android */
    }
    return perm.display || "denied";
  }
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

let audioCtx = null;
export function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

let alarmOn = false;
let alarmTimer = 0;
let vibTimer = 0;
let pingTimer = 0;
let alarmKill = 0;
let wakeLock = null;
const alarmNodes = [];

function tone(ctx, { freq, type, start, dur, gain, dest }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.02);
  g.gain.setValueAtTime(gain, start + dur - 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g);
  g.connect(dest);
  o.start(start);
  o.stop(start + dur + 0.02);
  alarmNodes.push(o);
}

function playAlarmBurst() {
  const ctx = unlockAudio();
  if (!ctx) return;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 4;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.12;
  master.connect(comp);
  comp.connect(ctx.destination);
  const t0 = ctx.currentTime;
  const pairs = [880, 698, 932, 698, 1046, 784, 1174, 698];
  pairs.forEach((f, i) => {
    const start = t0 + i * 0.16;
    tone(ctx, { freq: f, type: "square", start, dur: 0.13, gain: 0.42, dest: master });
    tone(ctx, { freq: f * 0.5, type: "sawtooth", start, dur: 0.13, gain: 0.28, dest: master });
  });
  tone(ctx, { freq: 55, type: "square", start: t0, dur: 1.35, gain: 0.22, dest: master });
  tone(ctx, { freq: 1318, type: "square", start: t0 + 1.28, dur: 0.35, gain: 0.38, dest: master });
}

const VIB_ALARM = [900, 80, 900, 80, 900, 80, 1400, 120, 900, 80, 900, 200];

export function stopAlarm({ quiet } = {}) {
  alarmOn = false;
  clearInterval(alarmTimer);
  clearInterval(vibTimer);
  clearInterval(pingTimer);
  clearTimeout(alarmKill);
  alarmTimer = vibTimer = pingTimer = alarmKill = 0;
  while (alarmNodes.length) {
    const n = alarmNodes.pop();
    try {
      n.stop();
    } catch {
      /* already ended */
    }
  }
  if (navigator.vibrate) navigator.vibrate(0);
  if (wakeLock) {
    try {
      wakeLock.release();
    } catch {
      /* ignore */
    }
    wakeLock = null;
  }
  if (!quiet) window.dispatchEvent(new CustomEvent("hayat-alarm", { detail: { on: false } }));
}

export function startAlarm({ title, body, tag } = {}) {
  stopAlarm({ quiet: true });
  alarmOn = true;
  unlockAudio();
  if (navigator.wakeLock?.request) {
    navigator.wakeLock.request("screen").then((l) => { wakeLock = l; }).catch(() => {});
  }
  playAlarmBurst();
  if (navigator.vibrate) navigator.vibrate(VIB_ALARM);
  alarmTimer = setInterval(() => {
    if (!alarmOn) return;
    playAlarmBurst();
  }, 1500);
  vibTimer = setInterval(() => {
    if (!alarmOn) return;
    if (navigator.vibrate) navigator.vibrate(VIB_ALARM);
  }, 2600);
  let pings = 0;
  pingTimer = setInterval(() => {
    if (!alarmOn) return;
    pings += 1;
    if (pings > 8) {
      stopAlarm();
      return;
    }
    shoutNotify({ title, body, tag: tag || "namaz", sticky: true });
  }, 12000);
  alarmKill = setTimeout(() => stopAlarm(), 120000);
  window.dispatchEvent(new CustomEvent("hayat-alarm", { detail: { on: true, title, body } }));
}

export function playChime(kind = "meal") {
  if (kind === "namaz") {
    startAlarm({ title: "Namaz", body: "Time for salah." });
    return;
  }
  unlockAudio();
  const ctx = audioCtx;
  if (!ctx) return;
  const now = ctx.currentTime;
  [523.25, 659.25, 783.99].forEach((freq, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, now + i * 0.28);
    g.gain.linearRampToValueAtTime(0.18, now + i * 0.28 + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.28 + 0.7);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(now + i * 0.28);
    o.stop(now + i * 0.28 + 0.75);
  });
  if (navigator.vibrate) navigator.vibrate([180, 80, 180]);
}

async function shoutNotify({ title, body, tag, sticky }) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const dest = swReg || (await navigator.serviceWorker.getRegistration());
  if (dest?.active) {
    dest.active.postMessage({ type: "notify", title, body, tag, sticky, url: "/", alarm: true });
    return;
  }
  new Notification(title, { body, tag, requireInteraction: true, silent: false });
}

export async function fireNotify({ title, body, tag, sticky, kind }) {
  const namaz = sticky || kind === "namaz";
  if (namaz) startAlarm({ title, body, tag });
  else playChime("meal");
  if (isNative() && namaz) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: nid(`now-${tag || title}`),
            title,
            body,
            schedule: { at: new Date(Date.now() + 800), allowWhileIdle: true },
            channelId: NAMAZ_CHANNEL,
            extra: { kind: "namaz", sticky: true },
            ongoing: true,
            sound: "alarm.wav",
          },
        ],
      });
    } catch {
      /* permission */
    }
    return;
  }
  await shoutNotify({ title, body, tag, sticky: namaz });
}

export function armAgenda(items) {
  clearAgendaTimers();
  const now = Date.now();
  for (const it of items) {
    const wait = it.at.getTime() - now;
    if (wait <= 0 || wait > 36 * 3600 * 1000) continue;
    const id = `${todayKey()}-${it.id}`;
    const t = setTimeout(() => {
      if (fired.has(id)) return;
      fired.add(id);
      fireNotify(it);
    }, wait);
    timers.push(t);
  }
  if (isNative()) scheduleNative(items).catch(() => {});
}

export function buildAgenda({ profile, prayerTimes, tasks, date = new Date() }) {
  const items = [];
  const ayah = ayahOfDay(date);
  if (profile.notifyNamaz && prayerTimes) {
    for (const p of prayerTimes.times) {
      const at = parseClock(p.clock, date);
      at.setMinutes(at.getMinutes() + (Number(profile.namazOffsetMin) || 0));
      items.push({
        id: `namaz-${p.name}`,
        at,
        title: `${p.bangla} · ${p.name}`,
        body:
          p.name === "Fajr"
            ? prayerTimes.isRamadan
              ? `Fajr. Suhoor is over. Time for salah.`
              : `Time for salah. Today's ayah — ${ayah.en} (${ayah.ref})`
            : p.name === "Maghrib" && prayerTimes.isRamadan
              ? "Maghrib + Iftar. Dates and water, then pray."
              : "Time for salah. Face Qibla, make wudu if you haven't.",
        sticky: true,
        kind: "namaz",
      });
    }
    items.push({
      id: "ayah",
      at: parseClock("07:00", date),
      title: `Ayah · ${ayah.ref}`,
      body: ayah.en,
      sticky: false,
      kind: "ayah",
    });
  }
  if (profile.notifyMeals) {
    if (prayerTimes?.isRamadan && prayerTimes.ramadan) {
      const r = prayerTimes.ramadan;
      items.push({
        id: "meal-suhoor",
        at: parseClock(r.suhoorStart, date),
        title: "সাহরি · Suhoor",
        body: `Eat now. Last bite at ${r.suhoorEnd} (Imsak). Dates, ruti, egg, water.`,
        sticky: true,
        kind: "namaz",
      });
    } else {
      const day = todayPlan(profile, date);
      for (const m of day.meals) {
        items.push({
          id: `meal-${m.id}`,
          at: parseClock(m.time, date),
          title: `${m.bangla} · ${m.slot}`,
          body: m.title,
          sticky: false,
          kind: "meal",
        });
      }
    }
  }
  if (profile.notifyTasks) {
    for (const t of tasks) {
      if (!t.time || t.done) continue;
      items.push({
        id: `task-${t.id}`,
        at: parseClock(t.time, date),
        title: t.title,
        body: t.note || "Daily task reminder",
        sticky: false,
        kind: "task",
      });
    }
  }
  return items.filter((x) => x.at > date).sort((a, b) => a.at - b.at);
}

const fired = new Set();
const timers = [];

export function clearAgendaTimers() {
  while (timers.length) clearTimeout(timers.pop());
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
