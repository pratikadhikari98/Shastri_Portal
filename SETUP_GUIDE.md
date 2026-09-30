# 📚 शास्त्री पोर्टल v4 — Complete Setup Guide

---

## 🗂️ File Structure (सबै files)

```
shastri-v4/
│
├── index.html                    ← मुख्य website (एउटै HTML)
├── manifest.json                 ← PWA support
│
├── css/
│   └── style.css                 ← सम्पूर्ण design (7 themes, fonts, animations)
│
├── js/
│   └── main.js                   ← सम्पूर्ण features (search, notes, history...)
│
├── data/
│   ├── books.json                ← ★ किताब र समाचारको data
│   └── chapters/
│       ├── nep1_1/                ← नेपाली साहित्य १ (प्रथम वर्ष) — प्रत्येक किताबको आफ्नै folder
│       │   ├── 1.json             ← अध्याय १
│       │   ├── 2.json             ← अध्याय २
│       │   └── 3.json             ← अध्याय ३ (जति चाहिन्छ त्यति थप्न मिल्छ)
│       ├── nep1_2/
│       │   ├── 1.json
│       │   └── 2.json
│       ├── san1_1/
│       │   └── ...
│       └── ... (हरेक किताबको ID अनुसार एउटा folder, ५२ भन्दा बढी)
│
└── images/
    ├── year1/                    ← प्रथम वर्षका cover photos
    ├── year2/                    ← द्वितीय वर्षका cover photos
    ├── year3/                    ← तृतीय वर्षका cover photos
    ├── year4/                    ← चतुर्थ वर्षका cover photos
    └── news/                     ← समाचारका photos
```

---

## 🔍 Google Search Console मा submit गर्ने

Website Deploy भइसकेपछि (तलको Step 5 पछि):

1. **डोमेन अपडेट गर्नुस्** — यी ३ फाइलमा `https://example.com` लाई आफ्नो वास्तविक website link ले बदल्नुस्:
   - `index.html` → `<link rel="canonical" ...>`
   - `robots.txt` → `Sitemap:` लाइन
   - `sitemap.xml` → `<loc>` लाइन
2. **https://search.google.com/search-console** मा जानुस् → आफ्नो website link थप्नुस्
3. Verify गर्न भनेको ठाउँमा — Search Console ले दिने `google-site-verification` code लाई `index.html` को `<head>` भित्र (जहाँ कमेन्टमा लेखिएको छ त्यहाँ) राख्नुस्, अनि Verify थिच्नुस्
4. Verify भएपछि **"Sitemaps"** मा गएर `sitemap.xml` submit गर्नुस्

---

## 🚀 GitHub मा राख्ने — Step by Step

### Step 1: GitHub Account बनाउनुस् (पहिलो पटक मात्र)
1. **https://github.com** खोल्नुस्
2. माथि दायाँमा **"Sign up"** थिच्नुस्
3. Email, Username, Password राखेर account बनाउनुस्
4. Email verify गर्नुस्

---

### Step 2: New Repository बनाउनुस्
1. Login गरेपछि माथि दायाँमा **"+"** icon → **"New repository"**
2. Repository name: **`shastri-portal`**
3. Description: `शास्त्री कक्षा पोर्टल` (ऐच्छिक)
4. **"Public"** select गर्नुस् ✅
5. **"Add a README file"** check गर्नुस् ✅
6. **"Create repository"** थिच्नुस्

---

### Step 3: Files Upload गर्नुस् (Drag & Drop — सबैभन्दा सजिलो)
1. आफ्नो repository page खोल्नुस्
2. **"Add file"** button → **"Upload files"** थिच्नुस्
3. ZIP extract गरेको **`shastri-v4`** folder खोल्नुस्
4. **सबै files र folders** select गरेर GitHub मा drag गर्नुस्
   > ⚠️ `data/`, `css/`, `js/`, `images/` folders सहित सबै
5. तल **"Commit changes"** → **"Commit directly to the main branch"** → **"Commit changes"**

---

### Step 4: GitHub Pages Enable गर्नुस्
1. Repository मा माथि **"Settings"** tab थिच्नुस्
2. बायाँतर्फ **"Pages"** मा click गर्नुस्
3. **"Source"** → **"Deploy from a branch"** select
4. **Branch:** `main` | **Folder:** `/ (root)` → **"Save"**
5. ३–५ मिनेट पर्खनुस्

---

### Step 5: Website हेर्नुस् 🎉
```
https://YourUsername.github.io/shastri-portal/
```
> `YourUsername` को ठाउँमा आफ्नो GitHub username राख्नुस्

---

## ✏️ किताबको नाम र लेखक थप्ने

`data/books.json` खोल्नुस् र placeholder भर्नुस्:

```json
{
  "id": "nep1_1",
  "title": "नेपाली साहित्य — मेरो पाठ्यपुस्तक",
  "author": "डा. रामप्रसाद शर्मा",
  "description": "प्रथम वर्षको नेपाली साहित्यको पाठ्यपुस्तक"
}
```

**GitHub मा directly edit गर्न:**
1. Repository → `data/books.json` → ✏️ (pencil icon)
2. Edit → "Commit changes"

---

## 📖 अध्याय Content थप्ने

अब हरेक अध्याय **छुट्टै file** मा हुन्छ, ताकि लेख्न र थप्न सजिलो होस्।

`data/chapters/nep1_1/` भित्र `1.json`, `2.json`, `3.json`... गरी फाइलहरू हुन्छन्। एउटा नयाँ अध्याय थप्न त्यही folder भित्र अर्को नम्बरको file (जस्तै `3.json`) बनाउनुस्:

```json
{
  "title": "अध्याय १ — आमाको सन्सार",
  "content": "# आमाको सन्सार\n\nआमा नेपालको संसार हुन्।\n\n## परिचय\n\n**आमा** भनेको जीवनको आधार हो।\n\n- मायाको स्रोत\n- शक्तिको केन्द्र\n- परिवारको मूल"
}
```

**नियमहरू:**
- फाइलको नाम क्रमैसँग हुनुपर्छ: `1.json`, `2.json`, `3.json`, `4.json`... (बीचमा नम्बर नछुटाइकनै)
- Website ले `1.json` बाट सुरु गरेर फाइल नभेटिएसम्म पढ्दै जान्छ, त्यसैले जति चाहिन्छ त्यति अध्याय थप्न मिल्छ
- नयाँ किताबको लागि, `data/chapters/` भित्र किताबको ID अनुसार नयाँ folder बनाई त्यसभित्र `1.json` बाट सुरु गर्नुस्

**GitHub मा directly थप्न:**
1. Repository → `data/chapters/{bookId}/` folder खोल्नुस्
2. **"Add file"** → **"Create new file"** → नाम राख्नुस् जस्तै `3.json`
3. माथिको ढाँचामा content लेखेर "Commit changes"

### ✍️ Text कसरी Format गर्ने (Bold, Highlight, आदि)

Chapter content JSON फाइल भित्र एउटै लामो लाइनमा लेखिन्छ, त्यसैले लेख्दा यी कुरा याद राख्नुस्:

⚠️ **सबैभन्दा जरूरी नियम:** JSON भित्र नयाँ लाइन (paragraph break) चाहेमा **वास्तविक Enter थिच्नुहुँदैन** — बरु `\n` (backslash + n) लेख्नुस्। दुई `\n\n` राख्दा नयाँ paragraph बन्छ।

| तपाईंले यसो लेख्नुस् | देखिने नतिजा |
|---|---|
| `**बोल्ड टेक्स्ट**` | **बोल्ड टेक्स्ट** (गाढा/मोटो अक्षर) |
| `*italic टेक्स्ट*` | *छड्के अक्षर* |
| `==highlight गर्ने टेक्स्ट==` | पहेंलो background सहित 🟡highlight भएको टेक्स्ट |
| `# ठूलो शीर्षक` | सबैभन्दा ठूलो heading |
| `## मध्यम शीर्षक` | मध्यम आकारको heading |
| `### सानो शीर्षक` | सानो heading |
| `- पहिलो कुरा` (हरेक लाइनको सुरुमा `- `) | • Bullet list |
| `> महत्त्वपूर्ण नोट` | Quote/note box मा देखिने |
| `![फोटोको नाम](images/photo.jpg)` | बीचमा फोटो embed हुने |
| `\n\n` (दुई पटक) | नयाँ paragraph सुरु |

**पूरा उदाहरण** — यसरी बोल्ड र highlight एकैचोटि प्रयोग गर्न मिल्छ:

```json
{
  "title": "अध्याय १ — आमाको सन्सार",
  "content": "## परिचय\n\n**आमा** भनेको जीवनको आधार हो। ==यो अंश परीक्षामा महत्त्वपूर्ण छ==।\n\nअर्को paragraph यहाँ सुरु हुन्छ। *यो italic मा छ*।\n\n> यो एउटा महत्त्वपूर्ण नोट हो।\n\n- पहिलो बुँदा\n- दोस्रो बुँदा\n- तेस्रो बुँदा"
}
```

यसले देखाउँछ: "परिचय" heading, त्यसपछि bold + highlight भएको वाक्य, नयाँ paragraph मा italic टेक्स्ट, एउटा quote box, अनि bullet list।

---

### Markdown Shortcuts (छोटो सूची):
| लेख्नुस् | Result |
|---------|--------|
| `# शीर्षक` | ठूलो heading |
| `## शीर्षक` | Medium heading |
| `### शीर्षक` | सानो heading |
| `**text**` | **Bold** |
| `*text*` | *Italic* |
| `==text==` | Highlight |
| `- item` | Bullet list |
| `> text` | Quote box |
| `![alt](url)` | Photo embed |

---

## 📰 समाचार थप्ने (Photo सहित)

`data/books.json` मा `"news"` array मा:

```json
{
  "id": 6,
  "title": "नयाँ परीक्षा तालिका",
  "content": "२०८१ सालको शास्त्री परीक्षाको तालिका प्रकाशित।",
  "date": "२०८१-०३-०१",
  "category": "परीक्षा",
  "image": "images/news/exam.jpg"
}
```

**Photo थप्न:** `images/news/exam.jpg` नाम राखेर upload गर्नुस्।
Photo नभए `"image": ""` छोड्नुस्।

**Categories:** `परीक्षा` | `पाठ्यक्रम` | `छात्रवृत्ति` | `कार्यक्रम` | `कार्यशाला`

---

## 🖼️ Book Cover Photo थप्ने

1. Photo को नाम: `nep1.jpg`, `eng2.jpg`, `san3.jpg` आदि
2. Folder: `images/year1/` (वर्ष अनुसार)
3. `books.json` मा: `"cover": "images/year1/nep1.jpg"`

**Photo size:** 400×300px, JPEG format राम्रो हुन्छ।

---

## 🔤 Subject Icon (नेपाली/English/संस्कृत... को छेउको आइकन)

हरेक विषयको header मा emoji छैन — कि त तपाईंले दिनुभएको SVG/PNG icon, कि नत्र विषयको पहिलो अक्षर (जस्तै नेपाली→**ने**, English→**अ**) auto देखिन्छ।

`js/main.js` को माथिपट्टि `SUBJ` object भित्र, हरेक विषयमा `iconSvg` थप्नुस्:

```js
nepali: { label:'नेपाली साहित्य', short:'ने', iconSvg:'images/icons/nepali.svg', g:'#FFE0B2,#FF8A65' },
```

`iconSvg` नराखे स्वतः `short` अक्षर देखिन्छ — केहि गर्नु पर्दैन।

---

## 👤 निर्माता / सहयोगी (Creator & Contributors) — Settings पेजको पुछारमा

`index.html` मा `<!-- ── Creator Box ── -->` भन्दा तल खोज्नुस्:

- **नाम बदल्न:** `.creator-name` भित्रको text बदल्नुस्
- **Facebook/Instagram/YouTube link राख्न:** हरेक `<a class="social-ico ...">` को `href="#"` लाई आफ्नो वास्तविक profile link ले बदल्नुस्
- **सहयोगी थप्न/हटाउन:** `<!-- ── सहयोगीहरू (Contributors) ── -->` तलको `.contrib-item` हरू copy/paste/edit गर्नुस्, जति चाहिन्छ त्यति राख्न मिल्छ
- **Copyright वर्ष/नाम बदल्न:** `.copy-year` भित्रको text बदल्नुस्

---

## 🔧 Features Quick Guide

| Feature | कहाँ |
|---------|------|
| Night Mode | ⋮ (3-dots) → 🌙 रात्रि मोड |
| 7 Themes | ⋮ (3-dots) → 🎨 Theme छान्नुस् |
| Font Size | ⋮ (3-dots) → Slider |
| Search | हेडरको 🔍 आइकन थिच्नुस् |
| समाचार Board | Home page — swipe वा auto-rotate हुन्छ |
| Bookmark | किताब खोल्दा 🏷️ icon |
| Notes | तलको नोट nav |
| Backup | ⚙️ Settings → Export |
| अफलाइन Save/Delete | ⋮ (3-dots) → 📥 अफलाइनको लागि Save / 🗑️ हटाउनुस् |

---

## ❓ Common Problems

**Website देखिएन?**
→ Settings → Pages मा "Your site is published at..." देखिनु पर्छ। ५ मिनेट पर्खनुस्।

**Chapters देखिएनन्?**
→ `data/chapters/` folder properly upload भयो कि? JSON syntax सही छ?

**Photo देखिएन?**
→ File path exactly मिल्नु पर्छ। `images/year1/nep1.jpg` ≠ `Images/Year1/Nep1.jpg`

**Night mode काम गरेन?**
→ Browser cache clear गर्नुस् (Ctrl+Shift+R)

---

## 📱 Phone मा Home Screen मा Add गर्न

**iOS (iPhone/iPad):**
1. Safari मा website खोल्नुस्
2. Share button → "Add to Home Screen"
3. "Add" थिच्नुस्

**Android:**
1. Chrome मा website खोल्नुस्
2. ⋮ menu → "Add to Home Screen"
3. "Add"

---

Made with ❤️ · शास्त्री पोर्टल v4
