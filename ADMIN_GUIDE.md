# 🔐 Admin Guide — GitHub बाट सम्पादन (Firebase छैन)

अब website भित्रैबाट सूचना, समाचार, किताब, विषय, अध्याय र फोटो थप्न/सम्पादन/मेटाउन मिल्छ।
हरेक परिवर्तन सिधै तपाईंको GitHub repo मा **commit** बन्छ। GitHub Pages ले १–२ मिनेटमा सबैलाई देखाउँछ।
Admin = **वैध GitHub token भएको व्यक्ति** मात्र। Token बिना कसैले केही बदल्न सक्दैन।

## १. Token बनाउने (एकपटक)
1. GitHub → Settings → Developer settings → **Personal access tokens → Fine-grained tokens → Generate new token**
2. **Repository access → Only select repositories** → आफ्नो portal repo छान्नुस्
3. **Permissions → Repository permissions → Contents: Read and write** (अरू केही चाहिँदैन)
4. Expiration (जस्तै १ वर्ष) राखेर Generate → `github_pat_...` copy गर्नुस्

## २. Login
Website → ⚙️ सेटिङ र Profile → **Admin Login** → username, repo नाम र token राख्नुस् → **जोड्नुस्**।
"यो फोनमा याद राख्नुस्" थिचेको भए फेरि सोध्दैन। Token कोड वा GitHub मा कहिल्यै जाँदैन, यही browser मा मात्र बस्छ।

## ३. के कहाँ बस्छ
| के | फाइल |
|---|---|
| किताब | `data/books.json` |
| विषय | `data/subjects.json` |
| सूचना (Home board) | `data/news.json` |
| समाचार पेजका पोस्ट | `data/feed.json` |
| अध्याय (एउटा किताबको सबै) | `data/chapters/{bookId}.json` |
| अपलोड गरेका फोटो | `images/uploads/`, `images/covers/` |

## ४. पुरानो Firebase data सार्ने (एकपटक)
1. यो पूरा project GitHub मा राख्नुस् (upload/commit)
2. Pages खुलेपछि `https://USERNAME.github.io/REPO/tools/migrate-from-firebase.html` खोल्नुस्
3. token राखेर **१) Firebase बाट पढ्नुस्** → संख्या ठीक लागे **२) GitHub मा लेख्नुस्**
4. सकिएपछि `tools/` फोल्डर मेटाउनुस्। त्यसपछि Firebase project नै मेटाए पनि हुन्छ।

## ५. ध्यान दिनुपर्ने कुरा
- Token हराए/चोरिए: GitHub → Settings मा गएर token **Revoke** गर्नुस्, नयाँ बनाउनुस्।
- फोटो/अध्याय बदल्दा पुरानो फोटोको फाइल `images/` मा रहन्छ (हानि छैन, चाहे GitHub बाट हटाउन सकिन्छ)।
- सबै परिवर्तनको इतिहास GitHub को commit history मा हुन्छ, गल्ती भए त्यहीँबाट फर्काउन सकिन्छ।
- सामान्य पाठकले पोस्ट/अध्याय पठाउने (Code) र समीक्षा (pending) सुविधा हटाइएको छ, किनकि त्यसका लागि Firebase जस्तो server चाहिन्थ्यो।
