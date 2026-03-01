/**
 * Weekly report cron - runs every Sunday 23:00 UTC
 * Fetches data from Supabase and appends each user's report to the central Google Sheet
 *
 * Env vars: SUPABASE_URL, SUPABASE_ANON_KEY, CRON_SECRET (optional, for auth)
 */

const DATA_KEY = "swapkat_main";

function computeTaskProgress(tasks) {
  const currentWeek = (tasks || []).filter((t) => !t.carriedOver);
  if (!currentWeek.length) return 0;
  return Math.round((currentWeek.filter((t) => t.done).length / currentWeek.length) * 100);
}

function linkedOutcomeProgress(outcome, data) {
  const linked = (data.tasks || []).filter((t) => t.outcomeId === outcome.id && !t.carriedOver);
  if (!linked.length) return Math.max(0, Math.min(100, outcome.current || 0));
  return Math.round((linked.filter((t) => t.done).length / linked.length) * 100);
}

function buildWeeklyReportPayload(data, user, context, sheetsSecret) {
  const goalsAchievedPct = computeTaskProgress(data.tasks);
  const outcomes = data.outcomes || [];
  const outcomesAchievedPct =
    outcomes.length > 0
      ? Math.round(
          outcomes.reduce((sum, o) => sum + linkedOutcomeProgress(o, data), 0) / outcomes.length
        )
      : 0;
  const behaviorsBreached = {};
  (data.behaviors || []).forEach((b) => {
    const count = (data.behaviorLogs || []).filter((l) => l.behaviorId === b.id).length;
    behaviorsBreached[b.title] = count;
  });

  return {
    token: sheetsSecret || undefined,
    week: data.weekLabel || "",
    user,
    context,
    goalsAchievedPct,
    outcomesAchievedPct,
    behaviorsBreached,
    whatWentWell: "",
    whatToImprove: ""
  };
}

export default async function handler(req, res) {
  // Optional: verify cron secret (Vercel sends Authorization: Bearer <CRON_SECRET>)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers?.authorization;
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "SUPABASE_URL and SUPABASE_ANON_KEY must be set" });
  }

  try {
    // Fetch app data from Supabase
    const fetchRes = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/app_data?key=eq.${DATA_KEY}&select=data`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!fetchRes.ok) {
      throw new Error(`Supabase fetch failed: ${fetchRes.status}`);
    }

    const rows = await fetchRes.json();
    if (!rows || rows.length === 0) {
      return res.status(200).json({ success: true, appended: 0, message: "No data in Supabase" });
    }

    const state = rows[0].data;
    const sheetsUrl = (state.sheetsExportUrl || "").trim();
    const sheetsSecret = (state.sheetsSecret || "").trim() || undefined;

    if (!sheetsUrl) {
      return res.status(200).json({
        success: true,
        appended: 0,
        message: "Google Sheet URL not configured in app settings"
      });
    }

    const users = state.users || {};
    const userNames = Object.keys(users).filter((u) => users[u]?.personal && users[u]?.work);
    if (userNames.length === 0) {
      return res.status(200).json({ success: true, appended: 0, message: "No users configured" });
    }

    let appended = 0;
    const errors = [];

    for (const userName of userNames) {
      const userData = users[userName];
      for (const context of ["personal", "work"]) {
        const data = userData[context];
        if (!data) continue;

        const payload = buildWeeklyReportPayload(data, userName, context, sheetsSecret);

        try {
          const postRes = await fetch(sheetsUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const result = await postRes.json().catch(() => ({}));

          if (result.success) {
            appended++;
          } else {
            errors.push(`${userName}/${context}: ${result.error || "Unknown error"}`);
          }
        } catch (e) {
          errors.push(`${userName}/${context}: ${e.message}`);
        }
      }
    }

    return res.status(200).json({
      success: errors.length === 0,
      appended,
      total: userNames.length * 2,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error("Cron weekly report error:", err);
    return res.status(500).json({ error: err.message });
  }
}
