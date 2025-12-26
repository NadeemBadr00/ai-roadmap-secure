const admin = require("firebase-admin");

// --- تهيئة الفايربيز (Server-Side) ---
// نستخدم متغيرات البيئة لأننا لا نستطيع رفع ملف المفاتيح مع الكود
if (admin.apps.length === 0) {
  // هذا المتغير سنضعه في إعدادات Netlify لاحقاً
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

exports.handler = async (event, context) => {
  // 1. إعداد CORS (للسماح للمتصفح بالاتصال)
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // التعامل مع طلبات الـ OPTIONS (Pre-flight)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    // 2. التحقق من التوكن (Security Check)
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "Missing Auth Token" }) };
    }

    const idToken = authHeader.split("Bearer ")[1];
    
    // فك تشفير التوكن للتأكد من هوية المستخدم
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // 3. قراءة البيانات المرسلة
    const data = JSON.parse(event.body);
    const { courseId, lessonIndex, completed } = data;

    if (!courseId || typeof lessonIndex !== 'number') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid Data" }) };
    }

    // 4. تنفيذ المنطق (Business Logic)
    const userRef = db.collection('users').doc(uid);
    const xpReward = 50;

    let responseMsg = "";
    let newXp = 0;

    // نستخدم Transaction لضمان سلامة البيانات
    await db.runTransaction(async (t) => {
        const doc = await t.get(userRef);
        const userData = doc.data() || {};
        const currentProgress = userData.progress?.[courseId] || [];

        if (completed) {
            if (!currentProgress.includes(lessonIndex)) {
                t.update(userRef, {
                    [`progress.${courseId}`]: admin.firestore.FieldValue.arrayUnion(lessonIndex),
                    "xp": admin.firestore.FieldValue.increment(xpReward)
                });
                newXp = xpReward;
                responseMsg = "Completed & XP Added";
            } else {
                responseMsg = "Already Completed";
            }
        } else {
            t.update(userRef, {
                [`progress.${courseId}`]: admin.firestore.FieldValue.arrayRemove(lessonIndex)
            });
            responseMsg = "Uncompleted";
        }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: responseMsg, xpAdded: newXp })
    };

  } catch (error) {
    console.error("Function Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};