import { GoogleGenerativeAI } from "@google/generative-ai";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";

// --- FIREBASE IMPORTS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- FIREBASE SETUP ---
// التحقق الآمن من وجود التكوين
const rawConfig = typeof __firebase_config !== 'undefined' ? __firebase_config : '{}';
const firebaseConfig = JSON.parse(rawConfig);

const isFirebaseReady = Object.keys(firebaseConfig).length > 0;
let db = null;
let auth = null;

if (isFirebaseReady) {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    
    // تسجيل دخول تلقائي لضمان صلاحية القراءة والكتابة
    signInAnonymously(auth).catch(error => {
        console.error("Firebase Auth Error:", error);
    });
} else {
    console.warn("Firebase Config not found. Caching will be disabled.");
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app';

// --- CONFIGURATION ---
const chatConfig = {
    gemini: {
        // تم استعادة المفتاح الأصلي
        apiKey: "AIzaSyDTmArssErp3YVJgkPARp1szsHanUxDn7M",
        model: 'gemini-2.5-flash-preview-09-2025',
        ttsModel: 'gemini-2.5-flash-preview-tts'
    },
    googleSearch: {
        // تم استعادة المفتاح الأصلي
        apiKey: "AIzaSyDTmArssErp3YVJgkPARp1szsHanUxDn7M", 
        cx: "d27571e5c23044207"
    },
    pexels: { 
        // تم استعادة المفتاح الأصلي
        apiKey: "arfuYIRDMpQtQHxTrDuAqZ26TYEYfWkGnZRJZ5y2D4CycaZTWXgHDJbN" 
    }
};

const genAI = new GoogleGenerativeAI(chatConfig.gemini.apiKey);

// --- GLOBAL STATE ---
window.slidesData = [];
window.isPlaying = false;
window.exportRecorder = null;
window.exportChunks = [];
window.exportAnimationId = null;

// --- CACHING HELPERS (نظام التخزين المؤقت) ---

function sanitizeKey(query) {
    // تنظيف جملة البحث لاستخدامها كمعرف للمستند
    return query.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 50);
}

// 1. فحص الفايربيز
async function checkMediaCache(query, type) {
    if (!isFirebaseReady || !auth?.currentUser) return null;
    const key = sanitizeKey(query);
    // مسار التخزين: artifacts/{appId}/public/media_cache/{key}
    const docRef = doc(db, 'artifacts', appId, 'public', 'media_cache', key);
    
    try {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const data = snap.data();
            if (type === 'video' && data.videoUrl) return data.videoUrl;
            if (type === 'image' && data.imageUrl) return data.imageUrl;
        }
    } catch (e) {
        console.warn("Cache read error:", e);
    }
    return null;
}

// 2. الحفظ في الفايربيز
async function saveMediaCache(query, type, url) {
    if (!isFirebaseReady || !auth?.currentUser || !url) return;
    const key = sanitizeKey(query);
    const docRef = doc(db, 'artifacts', appId, 'public', 'media_cache', key);
    
    const updateData = {};
    if (type === 'video') updateData.videoUrl = url;
    else updateData.imageUrl = url;
    updateData.lastUpdated = new Date().toISOString();
    updateData.query = query;

    try {
        await setDoc(docRef, updateData, { merge: true });
        console.log(`[Cache] Saved ${type} for "${query}"`);
    } catch (e) {
        console.warn("Cache write error:", e);
    }
}

// --- API FETCHERS (جلب البيانات من المصادر الخارجية) ---

async function fetchPexelsMedia(query, type = 'photos') {
    const endpoint = type === 'videos' ? 'videos/search' : 'search';
    try {
        const res = await fetch(`https://api.pexels.com/v1/${endpoint}?query=${query}&per_page=1&orientation=landscape`, {
            headers: { Authorization: chatConfig.pexels.apiKey }
        });
        const data = await res.json();
        if (type === 'videos') {
            if(data.videos && data.videos.length > 0) {
                const files = data.videos[0].video_files;
                // نفضل دقة HD (عرض 1280) أو نأخذ أول ملف متاح
                return (files.find(v => v.width >= 1280) || files[0]).link;
            }
            return null;
        }
        return data.photos?.[0]?.src?.large2x || null;
    } catch (e) { 
        console.error("Pexels Error:", e);
        return null; 
    }
}

async function fetchGoogleImages(query) {
    const url = `https://www.googleapis.com/customsearch/v1?key=${chatConfig.googleSearch.apiKey}&cx=${chatConfig.googleSearch.cx}&q=${encodeURIComponent(query)}&searchType=image&num=1&safe=active`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        return data.items?.[0]?.link || null;
    } catch (e) {
        console.error("Google Image Search Error:", e);
        return null;
    }
}

// --- MAIN SMART FETCHER (EXPORTED & GLOBAL) ---
// هذه الدالة هي القلب النابض لنظام الوسائط
export async function getSmartMedia(query, type = 'image') {
    // 1. أولاً: نفحص الكاش (أسرع وأوفر)
    const cachedUrl = await checkMediaCache(query, type);
    if (cachedUrl) {
        console.log(`[Cache] Hit for: ${query}`);
        return { type: type, src: cachedUrl };
    }

    // 2. ثانياً: إذا لم نجد في الكاش، نتصل بالـ APIs
    console.log(`[API] Fetching fresh media for: ${query}`);
    let fetchedUrl = null;

    if (type === 'video') {
        fetchedUrl = await fetchPexelsMedia(query, 'videos');
    } else {
        // للصور، نحاول Pexels أولاً لجودتها العالية
        fetchedUrl = await fetchPexelsMedia(query, 'photos');
        // إذا فشل Pexels، نلجأ لجوجل
        if (!fetchedUrl) {
            fetchedUrl = await fetchGoogleImages(query);
        }
    }

    // 3. ثالثاً: نحفظ النتيجة في الكاش للمرة القادمة
    if (fetchedUrl) {
        await saveMediaCache(query, type, fetchedUrl);
        return { type: type, src: fetchedUrl };
    }

    // fallback للصورة الافتراضية إذا فشل كل شيء
    return { type: 'image', src: 'https://via.placeholder.com/800x600?text=No+Media' };
}
// ربط الدالة بالـ window لتكون متاحة للكود القديم والملفات الأخرى (مثل app.js)
window.getSmartMedia = getSmartMedia;


// --- AI CHAT FUNCTION ---
export async function askGemini(prompt, context = '') {
    const model = genAI.getGenerativeModel({ model: chatConfig.gemini.model });
    
    let media = null;
    const isVideoRequest = prompt.includes('فيديو') || prompt.includes('video') || prompt.includes('شاهد') || prompt.includes('watch');
    const cleanQuery = prompt.replace(/^(شرح|ما هو|كيف|explain|what is|how to|أريد|I want|show me)/i, '').trim();
    
    if(cleanQuery.length > 2) {
         // استخدام الدالة الذكية لجلب صورة أو فيديو
         const res = await getSmartMedia(cleanQuery, isVideoRequest ? 'video' : 'image');
         if(res && typeof res === 'string') media = { type: 'image', src: res };
         else if(res && res.src) media = res; 
    }

    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${chatConfig.googleSearch.apiKey}&cx=${chatConfig.googleSearch.cx}&q=${encodeURIComponent(prompt)}`;
    let searchContext = "";
    let sources = [];
    
    try {
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        if(searchData.items) {
            sources = searchData.items.slice(0, 3);
            searchContext = "\n\n[Google Search Results]:\n" + sources.map(s => `- ${s.title}: ${s.snippet}`).join("\n");
        }
    } catch(e) { console.error("Search Text Error:", e); }

    const fullPrompt = `You are an expert tutor. Context: ${context} ${searchContext} Question: ${prompt}. Answer in Arabic using Markdown.`;
    const result = await model.generateContent(fullPrompt);
    return { text: result.response.text(), sources, media };
}

// --- VIDEO HELPERS (WINDOW ATTACHED) ---

// 1. توليد السيناريو
window.callGeminiScript = async (topic) => {
    const prompt = `
        أنت مخرج أفلام وثائقية. اشرح موضوع "${topic}" في 4 مشاهد قصيرة.
        الرد يجب أن يكون JSON Array فقط. كل عنصر يحتوي على:
        1. "text": جملة الشرح (عربية، شيقة، قصيرة).
        2. "query": جملة بحث بالإنجليزية لوصف المشهد (للبحث عن فيديو/صورة).
        Format: [{"text": "...", "query": "..."}, ...]
    `;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${chatConfig.gemini.model}:generateContent?key=${chatConfig.gemini.apiKey}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
    });
    const data = await res.json();
    return JSON.parse(data.candidates[0].content.parts[0].text);
};

// 2. تحويل النص إلى صوت (TTS)
window.callGeminiTTS = async (text) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${chatConfig.gemini.ttsModel}:generateContent?key=${chatConfig.gemini.apiKey}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            contents: [{ parts: [{ text: text }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } } }
            }
        })
    });
    const d = await res.json();
    const b64 = d.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if(!b64) throw new Error("TTS Failed");
    
    // تحويل البيانات الخام (PCM) إلى ملف WAV قابل للتشغيل في المتصفح
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for(let i=0; i<len; i++) bytes[i] = bin.charCodeAt(i);
    const pcm = new Int16Array(bytes.buffer);
    
    const wavHead = new ArrayBuffer(44);
    const v = new DataView(wavHead);
    v.setUint32(0, 0x46464952, true); // "RIFF"
    v.setUint32(4, 36 + pcm.byteLength, true);
    v.setUint32(8, 0x45564157, true); // "WAVE"
    v.setUint32(12, 0x20746d66, true); // "fmt "
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); // Channels
    v.setUint32(24, 24000, true); // Sample Rate
    v.setUint32(28, 24000 * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    v.setUint32(36, 0x61746164, true); // "data"
    v.setUint32(40, pcm.byteLength, true);
    
    return URL.createObjectURL(new Blob([v, pcm], {type: 'audio/wav'}));
};

// 3. تحميل الصور (للرسم على الـ Canvas)
window.loadImage = (url) => {
    return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
};

// 4. تجهيز المقاطع بالوسائط (تدعم الكاش الآن)
window.enrichSegments = async (segments) => {
    const results = [];
    for (let s of segments) {
        // نستخدم دالة getSmartMedia التي قمنا بتصديرها
        let mediaResult = await getSmartMedia(s.query, 'video');
        
        // إذا لم نجد فيديو، نبحث عن صورة
        if (!mediaResult || !mediaResult.src || mediaResult.src.includes('placeholder')) {
            mediaResult = await getSmartMedia(s.query, 'image');
        }

        let mediaUrl = mediaResult.src;
        // نستخدم بروكسي للصور لتجنب مشاكل CORS عند تصدير الفيديو
        if(mediaResult.type === 'image' && mediaUrl) {
            mediaUrl = `https://wsrv.nl/?url=${encodeURIComponent(mediaUrl)}&w=1280&h=720&fit=cover&output=jpg`;
        }

        results.push({
            text: s.text,
            query: s.query,
            type: mediaResult.type,
            url: mediaUrl,
            charLen: s.text.length,
            imgObj: mediaResult.type === 'image' ? await window.loadImage(mediaUrl) : null
        });
    }
    return results;
};

// --- RENDER UI (رسم واجهة المعلم الذكي) ---
export function renderAITutor(containerElement) {
    containerElement.innerHTML = `
        <div class="h-full flex flex-col max-w-5xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 animate-fadeIn">
            
            <!-- Header with Tabs -->
            <div class="p-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md z-10">
                <div class="flex flex-col md:flex-row justify-between items-center mb-4">
                    <div>
                        <h1 class="text-2xl font-bold flex items-center gap-2"><i class="fa-solid fa-brain"></i> المعلم الذكي</h1>
                        <p class="text-indigo-100 text-sm">شات ذكي + صانع فيديو</p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="window.switchTutorTab('chat')" id="tab-btn-chat" class="flex-1 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 border border-white/30">
                        <i class="fa-solid fa-comments"></i> المحادثة
                    </button>
                    <button onclick="window.switchTutorTab('video')" id="tab-btn-video" class="flex-1 px-4 py-2 bg-transparent hover:bg-white/10 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 opacity-70">
                        <i class="fa-solid fa-clapperboard"></i> تحويل نص لفيديو
                    </button>
                </div>
            </div>
            
            <!-- TAB 1: Chat Interface -->
            <div id="view-chat" class="flex-1 flex flex-col overflow-hidden">
                <div id="ai-chat-area" class="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/50">
                    <div class="flex gap-4">
                        <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0"><i class="fa-solid fa-robot"></i></div>
                        <div class="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-gray-100 max-w-[80%]">
                            <p>مرحباً! أنا معلمك الذكي. يمكنني شرح أي موضوع لك، أو البحث في الويب. جرب أيضاً تبويب "تحويل نص لفيديو" لإنشاء شروحات مرئية!</p>
                        </div>
                    </div>
                </div>
                <div class="p-4 bg-white border-t">
                    <form id="global-chat-form" class="flex gap-4 relative">
                        <input type="text" placeholder="اكتب سؤالك هنا..." class="flex-1 bg-gray-100 rounded-xl px-5 py-4 focus:ring-2 focus:ring-indigo-500 outline-none transition">
                        <button type="submit" class="bg-indigo-600 text-white px-8 rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200">
                            <i class="fa-solid fa-paper-plane"></i>
                        </button>
                    </form>
                </div>
            </div>

            <!-- TAB 2: Video Generator Interface -->
            <div id="view-video" class="flex-1 flex flex-col overflow-y-auto p-6 hidden bg-gray-50">
                <div class="max-w-3xl mx-auto w-full space-y-6">
                    
                    <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 text-center">
                        <h2 class="text-xl font-bold text-gray-800 mb-2">اصنع فيديو تعليمي في ثوانٍ 🎬</h2>
                        <p class="text-gray-500 text-sm mb-6">اكتب الموضوع، وسيقوم الذكاء الاصطناعي بكتابة السيناريو، جلب الفيديوهات، والتعليق الصوتي.</p>
                        
                        <div class="flex gap-3">
                            <input type="text" id="explainer-topic" placeholder="مثال: تاريخ الأهرامات..." class="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none">
                            <button onclick="window.startVideoGen()" id="btn-video-gen" class="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg flex items-center gap-2">
                                <i class="fa-solid fa-wand-magic-sparkles"></i> إنشاء
                            </button>
                        </div>
                        
                        <div id="video-status" class="hidden mt-4 text-sm text-indigo-600 font-bold animate-pulse">
                            <i class="fa-solid fa-gear fa-spin"></i> <span id="video-status-text">جاري التحليل...</span>
                        </div>
                        <div id="video-error" class="hidden mt-4 text-sm text-red-600 bg-red-50 p-2 rounded"></div>
                    </div>

                    <div id="player-container" class="hidden bg-black rounded-2xl shadow-2xl overflow-hidden relative aspect-video group select-none ring-4 ring-gray-900/5">
                        <img id="player-image" src="" class="w-full h-full object-contain bg-gray-900 transition-opacity duration-500 hidden">
                        <video id="player-video" class="w-full h-full object-cover hidden" muted playsinline loop crossorigin="anonymous"></video>
                        
                        <div class="absolute bottom-16 left-0 right-0 p-4 text-center pointer-events-none z-20">
                            <p id="player-caption" class="inline-block bg-black/60 backdrop-blur-md text-white px-4 py-2 rounded-xl text-lg font-medium shadow-xl transition-all"></p>
                        </div>

                        <div id="big-play-btn" class="absolute inset-0 flex items-center justify-center cursor-pointer z-30 bg-black/20" onclick="window.toggleVideoPlayback()">
                            <div class="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center transition hover:scale-110 border border-white/30">
                                <i class="fa-solid fa-play text-white text-3xl ml-1"></i>
                            </div>
                        </div>

                        <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-40">
                            <div class="w-full bg-gray-600/50 h-1 rounded-full cursor-pointer" onclick="window.seekVideo(event)">
                                <div id="video-progress" class="bg-indigo-500 h-full w-0 relative"></div>
                            </div>
                            <div class="flex justify-between text-white text-xs">
                                <span id="video-time">00:00</span>
                                <button onclick="window.toggleVideoFullscreen()"><i class="fa-solid fa-expand"></i></button>
                            </div>
                        </div>
                    </div>

                    <div id="export-actions" class="hidden flex justify-center gap-4">
                        <button onclick="window.exportVideoFile()" id="btn-export" class="bg-green-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-700 transition shadow-lg flex items-center gap-2">
                            <i class="fa-solid fa-download"></i> تحميل الفيديو (WEBM)
                        </button>
                    </div>
                    
                    <audio id="audio-player" crossorigin="anonymous" onended="window.videoEnded()" ontimeupdate="window.videoUpdate()"></audio>
                    <canvas id="export-canvas" width="1280" height="720" class="hidden"></canvas>

                </div>
            </div>
        </div>
    `;

    // Initialize Logic Handlers
    initChatLogic();
}

function initChatLogic() {
    // منطق التبديل بين التبويبات
    window.switchTutorTab = (tab) => {
        const chatView = document.getElementById('view-chat');
        const videoView = document.getElementById('view-video');
        const btnChat = document.getElementById('tab-btn-chat');
        const btnVideo = document.getElementById('tab-btn-video');

        if(tab === 'chat') {
            chatView.classList.remove('hidden');
            videoView.classList.add('hidden');
            btnChat.classList.add('bg-white/20', 'border-white/30');
            btnChat.classList.remove('opacity-70');
            btnVideo.classList.remove('bg-white/20', 'border-white/30');
            btnVideo.classList.add('opacity-70');
        } else {
            chatView.classList.add('hidden');
            videoView.classList.remove('hidden');
            btnVideo.classList.add('bg-white/20', 'border-white/30');
            btnVideo.classList.remove('opacity-70');
            btnChat.classList.remove('bg-white/20', 'border-white/30');
            btnChat.classList.add('opacity-70');
        }
    };

    // منطق الشات
    const chatArea = document.getElementById('ai-chat-area');
    const form = document.getElementById('global-chat-form');
    if(form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const input = e.target.querySelector('input');
            const text = input.value;
            if(!text) return;

            chatArea.innerHTML += `
                <div class="flex gap-4 flex-row-reverse animate-fadeIn">
                    <div class="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 flex-shrink-0"><i class="fa-solid fa-user"></i></div>
                    <div class="bg-primary text-white p-4 rounded-2xl rounded-tr-none shadow-md max-w-[80%]">${text}</div>
                </div>
            `;
            input.value = '';
            chatArea.scrollTop = chatArea.scrollHeight;

            const loadingId = 'loading-' + Date.now();
            chatArea.innerHTML += `
                <div id="${loadingId}" class="flex gap-4 animate-fadeIn">
                    <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0"><i class="fa-solid fa-robot"></i></div>
                    <div class="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-gray-100 text-gray-500 italic">
                        <i class="fa-solid fa-circle-notch fa-spin mr-2"></i> جاري الكتابة...
                    </div>
                </div>
            `;
            chatArea.scrollTop = chatArea.scrollHeight;

            const { text: aiText, sources, media } = await askGemini(text);
            document.getElementById(loadingId).remove();
            
            let mediaHtml = '';
            if(media) {
                if(media.type === 'video') mediaHtml = `<div class="mt-4 rounded-xl overflow-hidden shadow-lg"><video src="${media.src}" controls class="w-full max-h-80 object-cover"></video></div>`;
                else mediaHtml = `<div class="mt-4 rounded-xl overflow-hidden shadow-lg"><img src="${media.src}" class="w-full max-h-80 object-cover"></div>`;
            }
            
            let sourcesHtml = sources && sources.length ? `<div class="mt-4 pt-3 border-t border-gray-100"><p class="text-xs font-bold text-gray-500 mb-2 uppercase">المصادر</p>${sources.map(s => `<a href="${s.link}" target="_blank" class="block text-xs text-indigo-600 hover:underline truncate mb-1">• ${s.title}</a>`).join('')}</div>` : '';

            chatArea.innerHTML += `
                <div class="flex gap-4 animate-fadeIn">
                    <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0"><i class="fa-solid fa-robot"></i></div>
                    <div class="bg-white p-6 rounded-2xl rounded-tl-none shadow-sm border border-gray-100 max-w-[85%]">
                        <div class="prose prose-indigo max-w-none text-sm">${marked.parse(aiText)}</div>
                        ${mediaHtml}${sourcesHtml}
                    </div>
                </div>
            `;
            chatArea.scrollTop = chatArea.scrollHeight;
        };
    }

    // منطق الفيديو (نفس الوظائف السابقة)
    window.startVideoGen = async () => {
        const topic = document.getElementById('explainer-topic').value.trim();
        if(!topic) return;
        
        const btn = document.getElementById('btn-video-gen');
        const status = document.getElementById('video-status');
        const statusTxt = document.getElementById('video-status-text');
        const errorDiv = document.getElementById('video-error');
        const playerCont = document.getElementById('player-container');
        const exportActions = document.getElementById('export-actions');

        errorDiv.classList.add('hidden');
        playerCont.classList.add('hidden');
        exportActions.classList.add('hidden');
        btn.disabled = true;
        btn.classList.add('opacity-50');
        status.classList.remove('hidden');

        try {
            statusTxt.innerText = "جاري كتابة السيناريو...";
            const segments = await window.callGeminiScript(topic);
            
            statusTxt.innerText = "جاري البحث عن لقطات سينمائية (باستخدام الكاش)...";
            const richSegments = await window.enrichSegments(segments);
            
            statusTxt.innerText = "جاري توليد التعليق الصوتي...";
            const fullText = richSegments.map(s => s.text).join(" ");
            const audioUrl = await window.callGeminiTTS(fullText);

            window.setupVideoPlayer(richSegments, audioUrl);
            
            status.classList.add('hidden');
            btn.disabled = false;
            btn.classList.remove('opacity-50');
            playerCont.classList.remove('hidden');
            exportActions.classList.remove('hidden');

        } catch(err) {
            console.error(err);
            errorDiv.innerText = "حدث خطأ: " + err.message;
            errorDiv.classList.remove('hidden');
            status.classList.add('hidden');
            btn.disabled = false;
            btn.classList.remove('opacity-50');
        }
    };

    window.setupVideoPlayer = (segments, audioUrl) => {
        window.slidesData = segments;
        const audio = document.getElementById('audio-player');
        audio.src = audioUrl;
        
        audio.onloadedmetadata = () => {
            const totalLen = segments.reduce((a,b) => a + b.charLen, 0);
            let timer = 0;
            window.slidesData.forEach(s => {
                s.duration = (s.charLen / totalLen) * audio.duration;
                s.start = timer;
                timer += s.duration;
                s.end = timer;
            });
            window.updateVideoSlide(0);
        };
    };

    window.updateVideoSlide = (idx) => {
        if(idx < 0 || idx >= window.slidesData.length) return;
        const s = window.slidesData[idx];
        document.getElementById('player-caption').innerText = s.text;
        
        const v = document.getElementById('player-video');
        const i = document.getElementById('player-image');

        if(s.type === 'video') {
            i.classList.add('hidden');
            v.classList.remove('hidden');
            if(v.src !== s.url) { v.src = s.url; v.load(); if(window.isPlaying) v.play(); }
        } else {
            v.classList.add('hidden'); v.pause();
            i.classList.remove('hidden');
            if(i.src !== s.url) i.src = s.url;
        }
    };

    window.toggleVideoPlayback = () => {
        const audio = document.getElementById('audio-player');
        const video = document.getElementById('player-video');
        const btn = document.getElementById('big-play-btn');
        
        if(audio.paused) {
            audio.play();
            if(!video.classList.contains('hidden')) video.play();
            window.isPlaying = true;
            btn.classList.add('hidden');
        } else {
            audio.pause(); video.pause();
            window.isPlaying = false;
            btn.classList.remove('hidden');
        }
    };

    window.videoUpdate = () => {
        const audio = document.getElementById('audio-player');
        const bar = document.getElementById('video-progress');
        const pct = (audio.currentTime / audio.duration) * 100;
        bar.style.width = pct + "%";
        document.getElementById('video-time').innerText = Math.floor(audio.currentTime) + "s";
        
        const idx = window.slidesData.findIndex(s => audio.currentTime >= s.start && audio.currentTime < s.end);
        if(idx !== -1) window.updateVideoSlide(idx);
    };

    window.videoEnded = () => {
        window.toggleVideoPlayback();
        document.getElementById('audio-player').currentTime = 0;
        window.videoUpdate();
    };

    window.seekVideo = (e) => {
        const audio = document.getElementById('audio-player');
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        audio.currentTime = pct * audio.duration;
        window.videoUpdate();
    };

    window.toggleVideoFullscreen = () => {
        const el = document.getElementById('player-container');
        if(!document.fullscreenElement) el.requestFullscreen();
        else document.exitFullscreen();
    };

    window.exportVideoFile = async () => {
        const btn = document.getElementById('btn-export');
        const audio = document.getElementById('audio-player');
        const videoEl = document.getElementById('player-video');
        const canvas = document.getElementById('export-canvas');
        const ctx = canvas.getContext('2d');

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التصدير...';

        // Stream Setup
        let audioStream = audio.captureStream ? audio.captureStream() : audio.mozCaptureStream();
        let canvasStream = canvas.captureStream(30);
        let combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioStream.getAudioTracks()]);
        
        window.exportRecorder = new MediaRecorder(combined, { mimeType: 'video/webm; codecs=vp9' });
        window.exportChunks = [];
        
        window.exportRecorder.ondataavailable = e => { if(e.data.size > 0) window.exportChunks.push(e.data); };
        window.exportRecorder.onstop = () => {
            const blob = new Blob(window.exportChunks, {type: 'video/webm'});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `smart_tutor_${Date.now()}.webm`;
            a.click();
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-download"></i> تحميل الفيديو (WEBM)';
        };

        window.exportRecorder.start();
        audio.currentTime = 0;
        await audio.play();

        function renderLoop() {
            if(audio.paused || audio.ended) {
                if(window.exportRecorder.state === 'recording') window.exportRecorder.stop();
                return;
            }
            
            ctx.fillStyle = '#000';
            ctx.fillRect(0,0, canvas.width, canvas.height);

            const idx = window.slidesData.findIndex(s => audio.currentTime >= s.start && audio.currentTime < s.end);
            if(idx !== -1) {
                const s = window.slidesData[idx];
                let media = (s.type === 'video') ? videoEl : s.imgObj;
                
                if(media) {
                    if(s.type === 'video' && videoEl.paused) videoEl.play();
                    // Draw Media Cover
                    const scale = Math.max(canvas.width / media.videoWidth || media.width, canvas.height / media.videoHeight || media.height);
                    const w = (media.videoWidth || media.width) * scale;
                    const h = (media.videoHeight || media.height) * scale;
                    const x = (canvas.width - w) / 2;
                    const y = (canvas.height - h) / 2;
                    try { ctx.drawImage(media, x, y, w, h); } catch(e){}
                }

                // Draw Text
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.fillRect(0, canvas.height - 120, canvas.width, 120);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 36px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(s.text, canvas.width/2, canvas.height - 50);
            }
            window.exportAnimationId = requestAnimationFrame(renderLoop);
        }
        renderLoop();
    };
}