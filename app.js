import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, signInWithPopup, signInAnonymously, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, collection, addDoc, deleteDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// استيراد الواجهات من الملف الجديد
import * as UI from './ui.js';
import { renderAITutor } from './chat.js';
import { addXP, updateSocialLinks } from './gamification.js';

// --- FIREBASE CONFIGURATION ---
    const firebaseConfig = {
      apiKey: "AIzaSyA6WQKgXjdqe3ghQEQ5EXAMZM7ffiWlabk",
      authDomain: "ai-roadmap-jnadeem.firebaseapp.com",
      projectId: "ai-roadmap-jnadeem",
      storageBucket: "ai-roadmap-jnadeem.firebasestorage.app",
      messagingSenderId: "332299268804",
      appId: "1:332299268804:web:225b27d243845688194f91",
      measurementId: "G-P8E119RZDX"
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let isAdmin = false;

// Admin Email
const ADMIN_EMAILS = ["nadembadrs1@gmail.com"]; 

// --- DOM CACHE ---
const DOM = { main: document.getElementById('main-content') };

// --- GLOBAL STATE ---
let globalCourses = [];

// --- INITIAL SEED DATA ---
const initialCourses = [
    {
        id: 'cs50-harvard',
        title: 'منهج علوم الحاسب (CS50)',
        source: 'Harvard University (OpenCourseWare)',
        playlistId: 'PLhQjrBD2T380F_inVRXMIHCqLaNUd7bN4',
        cat: 'harvard computer science class',
        thumbnail: 'https://img.youtube.com/vi/3z9sq9e5u4k/maxresdefault.jpg',
        price: 19.99,
        desc: 'دراسة منهج CS50 الشهير عبر منصتنا مع أدوات تتبع التقدم والذكاء الاصطناعي.',
        category: 'Computer Science',
        lessons: [
            { title: "مقدمة في التفكير الحاسوبي", duration: "45 دقيقة" },
            { title: "لغة C والمفاهيم الأساسية", duration: "60 دقيقة" },
            { title: "المصفوفات والذاكرة", duration: "55 دقيقة" },
            { title: "هياكل البيانات والخوارزميات", duration: "70 دقيقة" },
            { title: "بايثون وتطبيقات الويب", duration: "65 دقيقة" }
        ]
    },
    {
        id: 'mit-deep-learning',
        title: 'أساسيات التعلم العميق',
        source: 'MIT (Open Learning)',
        playlistId: 'PLtBw6njQRU-rwp5a7yzPaBc_Kv4vz9IT6',
        cat: 'mit deep learning robot',
        thumbnail: 'https://i.ytimg.com/vi/QDX-1M5Nj7s/maxresdefault.jpg',
        price: 24.99,
        desc: 'مسار تعليمي منظم يعتمد على محاضرات MIT العامة حول الشبكات العصبية.',
        category: 'Artificial Intelligence',
        lessons: [
            { title: "مقدمة في الشبكات العصبية", duration: "50 دقيقة" },
            { title: "الشبكات العصبية المتكررة (RNN)", duration: "55 دقيقة" },
            { title: "الرؤية الحاسوبية (CNN)", duration: "60 دقيقة" },
            { title: "التعلم المعزز (RL)", duration: "45 دقيقة" }
        ]
    },
    {
        id: 'stanford-startup',
        title: 'ريادة الأعمال والشركات الناشئة',
        source: 'Stanford Online',
        playlistId: 'PL5q_lef6zVkaTY_cT1k7qFNF2TidHCe-1',
        cat: 'stanford startup business',
        thumbnail: 'https://i.ytimg.com/vi/CBYhVcO4kkI/maxresdefault.jpg',
        price: 15.99,
        desc: 'تنظيم لمحاضرات ستانفورد حول بناء الشركات الناشئة.',
        category: 'Business & Entrepreneurship',
        lessons: [
            { title: "كيف تجد الفكرة؟", duration: "40 دقيقة" },
            { title: "بناء الفريق المؤسس", duration: "35 دقيقة" },
            { title: "استراتيجية المنتج", duration: "50 دقيقة" },
            { title: "النمو والتسويق", duration: "45 دقيقة" }
        ]
    }
];

// --- DATA MANAGEMENT ---

async function fetchCourses() {
    try {
        const querySnapshot = await getDocs(collection(db, "courses"));
        if (querySnapshot.empty) {
            console.log("Seeding initial courses...");
            for (const c of initialCourses) {
                await setDoc(doc(db, "courses", c.id), c);
            }
            globalCourses = initialCourses;
        } else {
            globalCourses = querySnapshot.docs.map(doc => {
                const data = doc.data();
                if (!data.lessons) {
                    const fallback = initialCourses.find(ic => ic.id === doc.id)?.lessons || [{ title: "درس عام", duration: "30 دقيقة" }];
                    data.lessons = fallback;
                }
                return { ...data, id: doc.id };
            });
        }
    } catch (e) {
        console.error("Error fetching courses:", e);
        globalCourses = initialCourses;
    }
}

// --- LOGIC: PROGRESS & NOTES & GAMIFICATION ---

window.toggleLesson = async (courseId, lessonIdx, checkbox) => {
    if (!currentUser || currentUser.isAnonymous) return alert("يرجى تسجيل الدخول لحفظ التقدم");
    
    const userRef = doc(db, 'users', currentUser.uid);
    const progressKey = `progress.${courseId}`;
    
    try {
        if (checkbox.checked) {
            await updateDoc(userRef, {
                [progressKey]: arrayUnion(lessonIdx)
            });
            await addXP(db, currentUser.uid, 50);
        } else {
            await updateDoc(userRef, {
                [progressKey]: arrayRemove(lessonIdx)
            });
        }
        UI.renderCourseDetail(DOM.main, db, currentUser, isAdmin, globalCourses, courseId);
    } catch (e) {
        console.error("Progress Error:", e);
        const obj = {};
        obj[`progress.${courseId}`] = checkbox.checked ? arrayUnion(lessonIdx) : arrayRemove(lessonIdx);
        await setDoc(userRef, { progress: { [courseId]: checkbox.checked ? [lessonIdx] : [] } }, { merge: true });
        if(checkbox.checked) await addXP(db, currentUser.uid, 50);
        UI.renderCourseDetail(DOM.main, db, currentUser, isAdmin, globalCourses, courseId);
    }
};

let noteTimeout;
window.saveNote = (courseId, textarea) => {
    if (!currentUser || currentUser.isAnonymous) return;
    
    const statusEl = document.getElementById('note-status');
    statusEl.innerText = "جاري الكتابة...";
    statusEl.className = "text-xs text-gray-400";

    clearTimeout(noteTimeout);
    noteTimeout = setTimeout(async () => {
        statusEl.innerText = "جاري الحفظ...";
        try {
            const userRef = doc(db, 'users', currentUser.uid);
            await setDoc(userRef, {
                notes: { [courseId]: textarea.value }
            }, { merge: true });
            
            await addXP(db, currentUser.uid, 10);

            statusEl.innerText = "تم الحفظ ✓";
            statusEl.className = "text-xs text-green-600 font-bold";
        } catch (e) {
            console.error(e);
            statusEl.innerText = "خطأ في الحفظ";
            statusEl.className = "text-xs text-red-500";
        }
    }, 1000); 
};

window.saveSocialLinks = async (e) => {
    e.preventDefault();
    if (!currentUser || currentUser.isAnonymous) return alert("يرجى تسجيل الدخول");
    
    const formData = new FormData(e.target);
    const linkedin = formData.get('linkedin').trim();
    const github = formData.get('github').trim();
    
    const links = { linkedin, github };
    
    const btn = e.target.querySelector('button');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "جاري الحفظ...";
    
    await updateSocialLinks(db, currentUser.uid, links);
    
    if (linkedin || github) {
        const userRef = doc(db, 'users', currentUser.uid);
        const snap = await getDoc(userRef);
        if (snap.exists() && !snap.data().hasProfileXP) {
            await addXP(db, currentUser.uid, 100); 
            await setDoc(userRef, { hasProfileXP: true }, { merge: true });
            console.log("Profile Completion XP Awarded!");
        }
    }
    
    btn.disabled = false;
    btn.innerText = originalText;
};

// --- ADMIN FUNCTIONS ---

async function addCourse(courseData) {
    if (!isAdmin) return alert("غير مصرح");
    try {
        const id = courseData.id || 'course_' + Date.now();
        courseData.lessons = [
            { title: "مقدمة الكورس", duration: "10:00" },
            { title: "الدرس الأول", duration: "15:00" },
            { title: "الدرس الثاني", duration: "20:00" }
        ];
        await setDoc(doc(db, "courses", id), { ...courseData, id });
        alert("تمت إضافة الكورس بنجاح!");
        await fetchCourses();
        UI.renderAdminDashboard(DOM.main, db, isAdmin, globalCourses);
    } catch (e) {
        alert("حدث خطأ: " + e.message);
    }
}

async function deleteCourse(courseId) {
    if (!isAdmin) return alert("غير مصرح");
    if (!confirm("هل أنت متأكد من حذف هذا الكورس؟")) return;
    try {
        await deleteDoc(doc(db, "courses", courseId));
        alert("تم الحذف.");
        await fetchCourses();
        UI.renderAdminDashboard(DOM.main, db, isAdmin, globalCourses);
    } catch (e) {
        alert("حدث خطأ: " + e.message);
    }
}

// --- ROUTING ---
async function route() {
    const hash = window.location.hash.substring(1) || 'dashboard';
    
    // Check Auth
    if(!currentUser && hash !== 'auth') { 
        UI.renderAuth(DOM.main, auth, signInWithPopup, signInAnonymously, GoogleAuthProvider, setDoc); 
        return; 
    }
    if(hash === 'auth') { 
        UI.renderAuth(DOM.main, auth, signInWithPopup, signInAnonymously, GoogleAuthProvider, setDoc); 
        return; 
    }

    // Clean UI
    document.getElementById('app').classList.remove('hidden');
    setTimeout(() => document.getElementById('app').classList.remove('opacity-0'), 50);
    document.getElementById('loader').classList.add('hidden');

    // Routing Logic using UI Module
    if(hash === 'dashboard') await UI.renderDashboard(DOM.main, db, currentUser, isAdmin, globalCourses); 
    else if(hash === 'courses') await UI.renderCourses(DOM.main, db, isAdmin, globalCourses);
    else if(hash === 'aitutor') await renderAITutor(DOM.main); 
    else if(hash === 'profile') await UI.renderProfile(DOM.main, db, currentUser, isAdmin, globalCourses);
    else if(hash === 'admin') await UI.renderAdminDashboard(DOM.main, db, isAdmin, globalCourses);
    else if(hash.startsWith('course/')) await UI.renderCourseDetail(DOM.main, db, currentUser, isAdmin, globalCourses, hash.split('/')[1]);
}

// --- INITIALIZATION ---
window.deleteCourse = deleteCourse; 
window.addCourse = addCourse;

onAuthStateChanged(auth, async (u) => {
    currentUser = u;
    if(u) {
        isAdmin = ADMIN_EMAILS.includes(u.email);
        await fetchCourses();

        document.getElementById('user-initial').textContent = u.displayName?.[0] || 'U';
        document.getElementById('header-username').textContent = u.displayName || 'زائر';
        
        const adminLink = document.getElementById('admin-sidebar-link');
        if(adminLink) {
             if(isAdmin) adminLink.classList.remove('hidden');
             else adminLink.classList.add('hidden');
        }

        const overlay = document.getElementById('auth-overlay');
        if(overlay) overlay.remove();

        const currentHash = window.location.hash.substring(1);
        if (currentHash === 'auth' || !currentHash) window.location.hash = 'dashboard';
        else route();
    } else {
        window.location.hash = 'auth';
        UI.renderAuth(DOM.main, auth, signInWithPopup, signInAnonymously, GoogleAuthProvider, setDoc);
    }
});

document.getElementById('sidebar-toggle').onclick = () => {
    const sb = document.getElementById('sidebar');
    sb.classList.toggle('translate-x-full');
    sb.classList.toggle('rtl:-translate-x-full');
};
document.getElementById('logout-btn').onclick = () => signOut(auth);
window.addEventListener('hashchange', route);