/* ================================================
   Firebase Config — शास्त्री पोर्टल Admin Login
   ================================================
   👉 यहाँ आफ्नो Firebase project को config राख्नुस्।
   कसरी पाउने / setup गर्ने: SETUP_GUIDE.md को
   "🔐 Admin Login (Firebase) Setup" खण्ड हेर्नुस्।

   ⚠️ यो apiKey लुकाउनु पर्दैन — Firebase को client config
   सार्वजनिक हुन्छ (browser मा जान्छ)। वास्तविक सुरक्षा
   Firestore Security Rules ले गर्छ (ADMIN_UID जाँचेर)।
*/
const firebaseConfig = {
  apiKey:            "AIzaSyAvCpiezexkjmVHIR_2WaUZc-1M1g2saco",
  authDomain:        "pratik-adhikari-a8884.firebaseapp.com",
  projectId:         "pratik-adhikari-a8884",
  storageBucket:     "pratik-adhikari-a8884.firebasestorage.app",
  messagingSenderId: "1075036044793",
  appId:             "1:1075036044793:web:02dafa74bc6cc8ac5f5128"
};

// 👉 Admin हुन सक्ने Google account(हरू) को UID यहाँ राख्नुस्।
// एकभन्दा बढी मानिसलाई edit access दिन चाहनुहुन्छ भने, comma छुट्याएर
// थप्नुस् — जस्तै: ["UID_1", "UID_2", "UID_3"]
// कसरी पत्ता लगाउने: SETUP_GUIDE.md हेर्नुस् (ती व्यक्तिले एकपटक
// लगइन गरेर Firebase Console → Authentication → Users मा UID देखिन्छ)।
const ADMIN_UIDS = [
  "N0vRagUQYha9L9arw0iy4qCaBW53"
];

firebase.initializeApp(firebaseConfig);
