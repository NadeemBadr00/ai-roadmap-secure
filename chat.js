import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";

// --- FIREBASE IMPORTS (Unified Version 9.23.0) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// --- FIREBASE SETUP ---
const firebaseConfig = {
    apiKey: "AIzaSyC-fNlQQHC4Fqbx2wIBoyPOm8o43PUhJrk",
    authDomain: "ai-roadmap-nadeem.firebaseapp.com",
    projectId: "ai-roadmap-nadeem",
    storageBucket: "ai-roadmap-nadeem.firebasestorage.app",
    messagingSenderId: "882087451108",
    appId: "1:882087451108:web:65fbb714732407d1768ff1"
};

// Initialize Firebase locally for this module
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- GEMINI SETUP ---
const genAI = new GoogleGenerativeAI(firebaseConfig.apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

const PEXELS_KEY = '563492ad6f917000010000019050d293d07e4776a33742460269382f'; // مفتاح بيكسلز للصور

// --- SYSTEM PROMPT ---
const SYSTEM_PROMPT = `
أنت "المعلم الذكي" في منصة Future Academy.
دورك: شرح المفاهيم البرمجية والعلمية بأسلوب مبسط باللهجة المصرية القريبة للفصحى.
- استخدم أمثلة عملية.
- لو السؤال عن كود، اكتب الكود بشكل واضح.
- كن مشجعاً وودوداً.
- لا تخرج عن سياق التعليم والتكنولوجيا.
`;

// --- MAIN FUNCTIONS ---

export async function renderAITutor(container) {
    container.innerHTML = `
        <div class="max-w-4xl mx-auto h-[calc(100vh-140px)] flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200 animate-fadeIn">
            <!-- Header -->
            <div class="bg-primary p-4 flex justify-between items-center text-white shadow-md z-10">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                        <i class="fa-solid fa-robot text-xl"></i>
                    </div>
                    <div>
                        <h2 class="font-bold text-lg">المعلم الذكي</h2>
                        <p class="text-xs text-green-100 flex items-center gap-1"><span class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span> متصل الآن</p>
                    </div>
                </div>
            </div>

            <!-- Chat Area -->
            <div id="chat-messages" class="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50 scroll-smooth">
                <!-- Welcome Message -->
                <div class="flex items-start gap-4">
                    <div class="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white shadow-lg shrink-0">
                        <i class="fa-solid fa-graduation-cap"></i>
                    </div>
                    <div class="bg-white p-4 rounded-2xl rounded-tr-none shadow-sm border border-gray-100 max-w-[80%]">
                        <p class="text-gray-700 leading-relaxed">
                            أهلاً بك يا بطل! 👋 <br>
                            أنا معلمك الذكي، جاهز أشرحلك أي حاجة في الكورسات أو أساعدك تحل المشاكل البرمجية.<br>
                            <span class="text-sm text-primary font-bold mt-2 block">ممكن تسألني:</span>
                            <span class="text-xs text-gray-500 block mt-1">• "اشرح لي قاعدة if condition"</span>
                            <span class="text-xs text-gray-500 block">• "كيف أبدأ في تعلم الذكاء الاصطناعي؟"</span>
                        </p>
                    </div>
                </div>
            </div>

            <!-- Input Area -->
            <div class="p-4 bg-white border-t border-gray-100">
                <form id="chat-form" class="relative flex items-end gap-2">
                    <div class="flex-1 relative">
                        <textarea 
                            id="user-input" 
                            rows="1"
                            class="w-full pl-12 pr-4 py-3 bg-gray-100 border-0 rounded-xl focus:ring-2 focus:ring-primary/50 focus:bg-white transition-all resize-none max-h-32"
                            placeholder="اكتب سؤالك هنا..."
                        ></textarea>
                        <button type="button" class="absolute left-3 bottom-3 text-gray-400 hover:text-primary transition">
                            <i class="fa-solid fa-microphone"></i>
                        </button>
                    </div>
                    <button type="submit" class="w-12 h-12 bg-primary hover:bg-secondary text-white rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center group">
                        <i class="fa-solid fa-paper-plane group-hover:scale-110 transition-transform"></i>
                    </button>
                </form>
                <p class="text-center text-[10px] text-gray-400 mt-2">المعلم الذكي مدعوم بواسطة Gemini Pro AI</p>
            </div>
        </div>
    `;

    // Logic
    const form = document.getElementById('chat-form');
    const input = document.getElementById('user-input');
    const messages = document.getElementById('chat-messages');

    input.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    form.onsubmit = async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;

        appendMessage(text, 'user', messages);
        input.value = '';
        input.style.height = 'auto';

        const loadingId = appendLoading(messages);

        try {
            const response = await askGemini(text);
            removeLoading(loadingId);
            appendMessage(response, 'ai', messages);
        } catch (err) {
            removeLoading(loadingId);
            appendMessage("عذراً، حدث خطأ في الاتصال. حاول مرة أخرى.", 'error', messages);
            console.error(err);
        }
    };
}

// --- HELPER FUNCTIONS ---

function appendMessage(text, type, container) {
    const div = document.createElement('div');
    div.className = `flex items-start gap-4 ${type === 'user' ? 'flex-row-reverse' : ''} animate-fadeIn`;
    
    let avatar = type === 'user' 
        ? `<div class="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 shadow-sm shrink-0"><i class="fa-solid fa-user"></i></div>`
        : `<div class="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white shadow-lg shrink-0"><i class="fa-solid fa-robot"></i></div>`;

    if (type === 'error') {
        avatar = `<div class="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-500 shadow-sm shrink-0"><i class="fa-solid fa-exclamation"></i></div>`;
    }

    const bubbleClass = type === 'user'
        ? 'bg-primary text-white rounded-2xl rounded-tl-none shadow-md'
        : type === 'error' ? 'bg-red-50 text-red-600 border border-red-100 rounded-2xl'
        : 'bg-white text-gray-700 rounded-2xl rounded-tr-none shadow-sm border border-gray-100';

    div.innerHTML = `
        ${avatar}
        <div class="${bubbleClass} p-4 max-w-[80%] overflow-hidden prose prose-sm ${type === 'user' ? 'prose-invert' : ''}">
            ${type === 'user' ? text : marked.parse(text)}
        </div>
    `;
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function appendLoading(container) {
    const id = 'loading-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = "flex items-start gap-4 animate-fadeIn";
    div.innerHTML = `
        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white shadow-lg shrink-0">
            <i class="fa-solid fa-robot fa-bounce"></i>
        </div>
        <div class="bg-white p-4 rounded-2xl rounded-tr-none shadow-sm border border-gray-100">
            <div class="flex gap-1">
                <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.4s"></div>
            </div>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return id;
}

function removeLoading(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

// --- GEMINI & MEDIA API ---

export async function askGemini(prompt) {
    try {
        const chat = model.startChat({
            history: [
                { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
                { role: "model", parts: [{ text: "مرحباً! أنا جاهز للمساعدة." }] },
            ],
        });

        const result = await chat.sendMessage(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Gemini Error:", error);
        throw error;
    }
}

/**
 * دالة البحث عن وسائط (صور/فيديو) من Pexels
 * تستخدم في توليد الفيديوهات التعليمية
 */
export async function getSmartMedia(query, type = 'video') {
    try {
        const url = type === 'video' 
            ? `https://api.pexels.com/videos/search?query=${query}&per_page=1&orientation=landscape`
            : `https://api.pexels.com/v1/search?query=${query}&per_page=1&orientation=landscape`;

        const res = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
        const data = await res.json();
        
        if (type === 'video' && data.videos && data.videos.length > 0) {
            return data.videos[0].video_files[0].link;
        } else if (type === 'image' && data.photos && data.photos.length > 0) {
            return data.photos[0].src.medium;
        }
        return null;
    } catch (e) {
        console.error("Media Fetch Error:", e);
        return null;
    }
}