# 📚 शास्त्री पोर्टल

शास्त्री विद्यार्थीहरूका लागि बनाइएको, कुनै backend/server नचाहिने, पूर्ण रूपमा **static** website। GitHub Pages जस्तो निःशुल्क hosting मा राखेर सिधै चलाउन मिल्छ।

---

## ✨ के-के छ यसमा

- वर्ष अनुसार (प्रथम–चतुर्थ) किताब/विषय सूची, अध्याय पढ्ने पेज
- हरेक अध्याय छुट्टै file मा — जति पनि थप्न मिल्ने
- Home page मा chalkboard-style समाचार board (swipe + auto-rotate)
- खोज्ने बटन, नोट लेख्ने, bookmark, पढ्ने history, backup/restore
- 7 themes + night mode, adjustable font size
- Offline-friendly (Service Worker सहित PWA)

---

## 🚀 GitHub Pages मा Deploy गर्ने — Step by Step

### Step 1 — GitHub Account (पहिलो पटक मात्र)
1. **https://github.com** खोल्नुस्
2. माथि दायाँ **"Sign up"** थिचेर account बनाउनुस्, email verify गर्नुस्

### Step 2 — नयाँ Repository बनाउनुस्
1. Login गरेपछि माथि दायाँ **"+"** → **"New repository"**
2. Name: `shastri-portal` (जे पनि राख्न मिल्छ)
3. **Public** select गर्नुस्
4. **"Create repository"** थिच्नुस्

### Step 3 — Files Upload गर्नुस्
1. Repository page मा **"Add file" → "Upload files"**
2. यो project को **सबै files र folders** (`index.html`, `css/`, `js/`, `data/`, `images/`, `manifest.json`, `sw.js` सबै) एकैचोटि drag गरेर हाल्नुस्
3. तल **"Commit changes"** थिच्नुस्

### Step 4 — GitHub Pages On गर्नुस्
1. Repository को **"Settings"** tab → बायाँतर्फ **"Pages"**
2. **Source** → **"Deploy from a branch"**
3. **Branch:** `main`, **Folder:** `/ (root)` → **"Save"**
4. ३–५ मिनेट पर्खनुस्

### Step 5 — Website हेर्नुस् 🎉
```
https://YourUsername.github.io/shastri-portal/
```
(`YourUsername` को ठाउँमा आफ्नो GitHub username राख्नुस्)

---

## ✏️ Content कसरी थप्ने/सम्पादन गर्ने

सबै content **कुनै कोडिङ ज्ञान बिना** GitHub मा सिधै edit गर्न मिल्छ — फाइल खोल्नुस्, pencil ✏️ icon थिच्नुस्, edit गरेर **"Commit changes"**।

| के थप्ने/बदल्ने | कुन फाइल |
|---|---|
| किताबको नाम, लेखक, कभर फोटो | `data/books.json` |
| अध्यायको content | `data/chapters/{bookId}/1.json`, `2.json`... |
| समाचार (Home board मा देखिने) | `data/books.json` → `"news"` array |
| विषयको icon (नेपाली/English/...) | `js/main.js` → `SUBJ` object |
| निर्माता/सहयोगी/social link/copyright | `index.html` → Settings पेजको पुछार |

**Google Search Console मा submit गर्न:** Deploy भएपछि `index.html`, `robots.txt`, `sitemap.xml` मा भएको `https://example.com` लाई आफ्नो वास्तविक link ले बदल्नुस् — पूरा steps [`SETUP_GUIDE.md`](./SETUP_GUIDE.md) मा।

**पूरा विस्तृत गाइड (उदाहरण JSON सहित): [`SETUP_GUIDE.md`](./SETUP_GUIDE.md)**

---

## 🗂️ File Structure

```
├── index.html            ← मुख्य website
├── manifest.json         ← PWA support
├── sw.js                 ← Offline support
├── css/style.css         ← सम्पूर्ण design
├── js/main.js            ← सम्पूर्ण features
├── data/
│   ├── books.json        ← किताब + समाचार data
│   └── chapters/         ← हरेक किताबको अध्याय (छुट्टै folder/file)
└── images/                ← Cover photo, news photo, icons
```

---

## ❓ समस्या आयो भने

- **Website देखिएन?** → Settings → Pages मा "published at..." देखिनुपर्छ, ५ मिनेट पर्खनुस्
- **Photo/Chapter देखिएन?** → File path ठ्याक्कै मिल्नुपर्छ (ठूलो/सानो अक्षर पनि फरक पर्छ)
- अरू सबै प्रश्नको जवाफ: [`SETUP_GUIDE.md`](./SETUP_GUIDE.md)

---

Made with ❤️ · शास्त्री पोर्टल
