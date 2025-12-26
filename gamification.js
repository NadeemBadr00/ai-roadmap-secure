import { getFirestore, doc, updateDoc, increment, getDocs, query, collection, orderBy, limit, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// --- GAMIFICATION LOGIC ---

/**
 * زيادة نقاط المستخدم
 */
export async function addXP(db, userId, amount) {
    if (!userId) return;
    const userRef = doc(db, 'users', userId);
    try {
        await setDoc(userRef, { xp: increment(amount) }, { merge: true });
        console.log(`Added ${amount} XP to user ${userId}`);
        
        // Show Toast Notification
        showToast(`+${amount} XP 🌟`);
    } catch (e) {
        console.error("Error adding XP:", e);
    }
}

/**
 * تحديث روابط التواصل الاجتماعي
 */
export async function updateSocialLinks(db, userId, links) {
    if (!userId) return;
    const userRef = doc(db, 'users', userId);
    try {
        await setDoc(userRef, { social: links }, { merge: true });
        showToast("تم تحديث الروابط بنجاح ✅");
    } catch (e) {
        console.error("Error updating social links:", e);
        alert("حدث خطأ في الحفظ");
    }
}

/**
 * الحصول على الأوسمة بناءً على النقاط
 */
export function getBadges(xp = 0) {
    const badges = [];
    if (xp >= 100) badges.push({ name: "بداية قوية", icon: "fa-rocket", color: "text-blue-500", bg: "bg-blue-100" });
    if (xp >= 500) badges.push({ name: "مجتهد", icon: "fa-book-open", color: "text-green-500", bg: "bg-green-100" });
    if (xp >= 1000) badges.push({ name: "مواظب", icon: "fa-fire", color: "text-orange-500", bg: "bg-orange-100" });
    if (xp >= 2000) badges.push({ name: "عبقري", icon: "fa-brain", color: "text-purple-500", bg: "bg-purple-100" });
    if (xp >= 5000) badges.push({ name: "أسطورة", icon: "fa-crown", color: "text-yellow-500", bg: "bg-yellow-100" });
    
    if (badges.length === 0) badges.push({ name: "مبتدئ", icon: "fa-seedling", color: "text-gray-500", bg: "bg-gray-100" });
    
    return badges;
}

/**
 * جلب وعرض لوحة المتصدرين
 */
export async function renderLeaderboardWidget(db, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `<div class="p-4 text-center text-gray-500"><i class="fa-solid fa-circle-notch fa-spin"></i> جاري تحميل المتصدرين...</div>`;

    try {
        const q = query(collection(db, "users"), orderBy("xp", "desc"), limit(5));
        const querySnapshot = await getDocs(q);
        
        let html = `
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div class="p-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-white flex justify-between items-center">
                    <h3 class="font-bold text-gray-800 flex items-center gap-2">
                        <i class="fa-solid fa-trophy text-yellow-500"></i> لوحة المتصدرين
                    </h3>
                    <span class="text-xs text-indigo-600 font-bold">الأعلى نقاطاً هذا الأسبوع</span>
                </div>
                <div class="divide-y divide-gray-50">
        `;

        let rank = 1;
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const displayName = data.displayName || "مستخدم مجهول";
            const xp = data.xp || 0;
            const avatar = data.displayName?.[0] || "U";
            const social = data.social || {};

            let rankClass = "bg-gray-100 text-gray-600";
            if (rank === 1) rankClass = "bg-yellow-100 text-yellow-600";
            if (rank === 2) rankClass = "bg-gray-200 text-gray-600";
            if (rank === 3) rankClass = "bg-orange-100 text-orange-600";

            html += `
                <div class="p-4 flex items-center justify-between hover:bg-gray-50 transition">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full ${rankClass} flex items-center justify-center font-bold text-sm shadow-sm">
                            ${rank}
                        </div>
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-lg shadow-sm border-2 border-white">
                            ${avatar}
                        </div>
                        <div>
                            <p class="font-bold text-gray-800 text-sm">${displayName}</p>
                            <div class="flex gap-2 text-xs">
                                ${social.linkedin ? `<a href="${social.linkedin}" target="_blank" class="text-blue-600 hover:text-blue-800"><i class="fa-brands fa-linkedin"></i></a>` : ''}
                                ${social.github ? `<a href="${social.github}" target="_blank" class="text-gray-700 hover:text-black"><i class="fa-brands fa-github"></i></a>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="block font-bold text-indigo-600 text-sm">${xp} XP</span>
                        <span class="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">${getBadges(xp).pop().name}</span>
                    </div>
                </div>
            `;
            rank++;
        });

        if (rank === 1) {
            html += `<div class="p-6 text-center text-gray-400 text-sm">لا يوجد بيانات حتى الآن 😴</div>`;
        }

        html += `</div></div>`;
        container.innerHTML = html;

    } catch (e) {
        console.error("Leaderboard Error:", e);
        container.innerHTML = `<div class="p-4 text-center text-red-400 text-sm">فشل تحميل القائمة</div>`;
    }
}

// Helper: Toast Notification
function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "fixed bottom-4 left-4 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-fadeIn z-50 transform transition-all duration-300";
    toast.innerHTML = `<i class="fa-solid fa-check-circle text-green-400"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}