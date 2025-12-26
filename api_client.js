import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

/**
 * دالة الاتصال بـ Netlify Functions
 * تقوم بإرسال التوكن لضمان الأمان
 */
export async function secureToggleLesson(courseId, lessonIndex, isCompleted) {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
        alert("يرجى تسجيل الدخول أولاً (Session Expired)");
        return;
    }

    try {
        console.log("Calling Netlify Function...");
        
        // 1. الحصول على التوكن الأمني (JWT)
        const token = await user.getIdToken();

        // 2. تحديد الرابط (النسبي)
        // هذا الرابط يعمل أوتوماتيكياً سواء كنت Local أو Live
        const endpoint = '/.netlify/functions/toggleLesson';

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` // إرسال التوكن للتحقق منه في الدالة
            },
            body: JSON.stringify({
                courseId: courseId,
                lessonIndex: lessonIndex,
                completed: isCompleted
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Server Error');
        }

        const result = await response.json();
        console.log("Netlify Response:", result);
        return result;

    } catch (error) {
        console.error("Secure Action Failed:", error);
        // alert("فشل الاتصال بالسيرفر الآمن: " + error.message);
        throw error;
    }
}