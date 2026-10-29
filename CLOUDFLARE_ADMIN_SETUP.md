# Admin: PIN + Fingerprint लगइन (Cloudflare सेटअप)

यो सेटअप नगरेसम्म साइटले पुरानै "Token राखेर लगइन" चलाउँछ। सेटअप भएपछि Admin Login मा PIN बाकस आउँछ,
र GitHub token फोनमा होइन, Cloudflare को Secret मा बस्छ।

## १. नयाँ GitHub token (फोनमा होइन, Cloudflare मा राख्ने)
GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
- Repository access: **Only select repositories** → `Shastri_Portal`
- Permissions: **Contents: Read and write** र **Issues: Read and write**
- म्याद: १ वर्ष
- बनेपछि कपी गर्नुस् (`github_pat_...`)

## २. Cloudflare मा Secret राख्ने
Cloudflare → Workers & Pages → तपाईंको Pages project → **Settings → Variables and Secrets** → Add (Type: **Secret**)

| नाम | के राख्ने |
|---|---|
| `ADMIN_GH_TOKEN` | माथिको GitHub token |
| `ADMIN_PIN` | तपाईंको PIN (४ अङ्क चल्छ; ६+ अङ्क बढी सुरक्षित) |
| `SESSION_SECRET` | कुनै ४०+ अनियमित अक्षर (जस्तै कुञ्जीपाटी ठोकेर बनाउनुस्) |

## ३. KV राख्ने (गलत PIN को गन्ती र Fingerprint को कुञ्जी राख्न)
1. Cloudflare → **Storage & Databases → KV → Create** → नाम: `shastri-admin`
2. Pages project → **Settings → Bindings → Add → KV namespace**
   - Variable name: `ADMIN_KV`
   - KV namespace: `shastri-admin`

## ४. फेरि deploy
Pages project → **Deployments** → पछिल्लो → **Retry deployment** (वा GitHub मा कुनै नयाँ commit)।

## ५. जाँच
साइट → सेटिङ → **Admin Login** → PIN बाकस आउनुपर्छ। PIN हालेपछि Admin खुल्छ।
**Fingerprint:** Admin खुलेपछि Admin Panel मा **"Fingerprint राख्नुस्"** थिच्नुस् → अर्कोपल्ट 👆 ले खोल्न मिल्छ।

## सुरक्षा बारे
- सेसन १२ घण्टाको हुन्छ। त्यसपछि PIN वा Fingerprint फेरि चाहिन्छ।
- ५ पटक गलत PIN भए १५ मिनेट लक (त्यसपछि ३०, ६० मिनेट … अधिकतम २४ घण्टा)।
- Fingerprint फोनको आफ्नै स्क्यानरले हुन्छ; सर्भरले केवल सार्वजनिक कुञ्जी राख्छ र जाँच्छ।
- सबै फोनबाट एकैचोटि Logout गर्न: `SESSION_SECRET` बदल्नुस्। सबै Fingerprint हटाउन KV को `creds` कुञ्जी मेटाउनुस्।
- GitHub token चोरिएको शङ्का भए GitHub मा Revoke गरेर नयाँ बनाई `ADMIN_GH_TOKEN` बदल्नुस् — फोनमा केही गर्नु पर्दैन।
