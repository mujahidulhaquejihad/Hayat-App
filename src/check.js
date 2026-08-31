import { bmi, targetCalories, weeklyPlan, defaultProfile, ayahOfDay, AYAT, qiblaBearing, minusMinutes, ramadanTimesFromTimings, isRamadan } from "./lib.js";
import { searchDuas } from "./duas.js";
import { NAMAZ_SURAHS, PRAYERS, STEPS } from "./namaz.js";

const p = { ...defaultProfile };
const b = bmi(p.weightKg, p.heightCm);
const kcal = targetCalories(p);
const w = weeklyPlan(p);
const lunchKcal = w.days[0].meals.find((m) => m.id === "lunch").kcal;

function must(ok, msg) {
  if (!ok) throw new Error(msg);
}
must(b > 28 && b < 32, `BMI should be ~30, got ${b}`);
must(kcal >= 2000 && kcal <= 2800, `loss target should fuel swimming, got ${kcal}`);
must(w.days.length === 7, "seven-day plan");
must(lunchKcal >= 500, `lunch is a real Bangladeshi plate, got ${lunchKcal}`);
must(w.days.every((d) => d.meals.length === 4 && d.meals[0].items.length >= 2), "simple plated meals");
must(w.days.every((d) => d.protein && d.protein.name), "weekly protein rotation");
must(AYAT.length >= 30 && AYAT.every((a) => a.ar && a.en && a.ref && a.pron), "daily ayat set");
must(ayahOfDay(new Date("2026-08-31")).ref.includes(":"), "ayah of the day has a citation");
const dhakaQibla = (qiblaBearing(23.81, 90.41) + 360) % 360;
must(dhakaQibla > 270 && dhakaQibla < 310, `Dhaka qibla should be WNW, got ${dhakaQibla}`);
must(searchDuas("ঘুম").length >= 1 && searchDuas("eat").length >= 1, "dua search");
must(PRAYERS.Fajr.fard === 2 && PRAYERS.Maghrib.fard === 3 && PRAYERS.Isha.units.some((u) => u.label === "Witr"), "hanafi rakats");
must(STEPS.length >= 8 && NAMAZ_SURAHS[0].id === "fatiha" && NAMAZ_SURAHS.length >= 8, "namaz surah pack");
must(minusMinutes("04:30", 45) === "03:45", "suhoor start is 45 min before imsak");
must(ramadanTimesFromTimings({ Fajr: "04:22", Imsak: "04:12", Maghrib: "18:18" }).iftar === "18:18", "iftar is maghrib");
must(isRamadan({ month: { number: 9 } }) && !isRamadan({ month: { number: 8 } }), "ramadan detector");
console.log("ok", { b: b.toFixed(1), kcal, ayah: ayahOfDay(new Date("2026-08-31")).ref, qibla: Math.round(dhakaQibla) });
