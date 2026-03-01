# Export Weekly Reports to Google Sheets

Follow these steps to send your weekly SwapKat reports to a Google Sheet.

## 1. Create a Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet
2. Name it e.g. "SwapKat Weekly Reports"
3. In row 1, add these headers (each in its own column):

   | Week | User | Context | Goals % | Outcomes % | Behaviors Breached | What went well | What to improve |
   |------|------|---------|---------|------------|---------------------|----------------|-----------------|

## 2. Add the Apps Script

1. In your Google Sheet, go to **Extensions → Apps Script**
2. Delete any sample code and paste this:

```javascript
const SECRET = ''; // Optional: set a password like 'mySecret123' - must match SwapKat config

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  let result = { success: false, error: null };

  try {
    const raw = e.postData ? e.postData.contents : (e.parameter && e.parameter.data);
    if (!raw) {
      result.error = 'No data received';
      return jsonResponse(result, 400);
    }
    const data = JSON.parse(raw);
    if (SECRET && data.token !== SECRET) {
      result.error = 'Invalid token';
      return jsonResponse(result, 401);
    }

    const behaviorsBreachedStr = typeof data.behaviorsBreached === 'object'
      ? JSON.stringify(data.behaviorsBreached || {})
      : (data.behaviorsBreached || '{}');

    const row = [
      data.week || '',
      data.user || '',
      data.context || '',
      data.goalsAchievedPct ?? '',
      data.outcomesAchievedPct ?? '',
      behaviorsBreachedStr,
      data.whatWentWell || '',
      data.whatToImprove || ''
    ];
    sheet.appendRow(row);
    result.success = true;
  } catch (err) {
    result.error = err.toString();
    return jsonResponse(result, 500);
  }

  return jsonResponse(result);
}

function jsonResponse(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
```

3. *(Optional)* Set a `SECRET` on line 2 and remember it — you'll enter it in SwapKat too
4. Click **Save** (disk icon), name the project "SwapKat Receiver"

## 3. Deploy as Web App

1. Click **Deploy → New deployment**
2. Click the gear icon → **Web app**
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**
5. Copy the **Web app URL** (looks like `https://script.google.com/macros/s/xxxxx/exec`)

## 4. Configure SwapKat

1. In SwapKat, click **Export to Google Sheets** (in the Weekly Report section)
2. Paste your Web app URL
3. If you set a SECRET, enter it in the Token field
4. Click Save

## 5. Export each week (manual)

1. Fill in "What went well?" and "What to improve?" (optional)
2. Click **Export**
3. A new row will appear in your Google Sheet

---

## 6. Automatic weekly export (Sunday cron)

The app can automatically append all reports to your Google Sheet every Sunday at 11:00 PM UTC—no need to open the app.

**Requirements:**

- App deployed on **Vercel** with **Supabase** (not localStorage)
- Google Sheet URL configured in the app (step 4 above)

### Setup

1. In your Vercel project, go to **Settings → Environment Variables**
2. Add these variables (for **Production**):

   | Name | Value |
   |------|-------|
   | `SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) |
   | `SUPABASE_ANON_KEY` | Your Supabase anon/public key |
   | `CRON_SECRET` | *(Optional)* A secret string to protect the cron endpoint |

3. Redeploy the project (or trigger a new deployment)

### How it works

- The cron runs **every Sunday at 23:00 UTC** (11 PM UTC)
- It fetches the latest data from Supabase
- For each user (Swapnil, Kat) and context (personal, work), it appends one row to your sheet
- The sheet URL and secret token are read from your app data (stored when you configured Export to Google Sheets)

### Notes

- **Cron jobs** are available on Vercel Hobby and Pro plans
- If you set `CRON_SECRET`, Vercel will send it when invoking the cron (no extra config needed)
- The cron runs **before** the week rolls in the app, so it captures the correct week's data
- You can still use the history pill or Export button for manual appends anytime
