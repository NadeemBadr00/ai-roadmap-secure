import { doc, getDoc, setDoc, arrayUnion, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import { renderAITutor, getSmartMedia, askGemini } from './chat.js';
import { renderLeaderboardWidget, getBadges } from './gamification.js';

// --- UI RENDERERS ---

// 1. عرض شبكة الكورسات
export async function renderCourses(container, db, isAdmin, globalCourses) {
    container.innerHTML = `
        <div class="space-y-6 animate-fadeIn">
            <div class="flex justify-between items-center border-r-4 border-primary pr-4">
                <h1 class="text-3xl font-bold text-gray-800">المسارات العالمية المتاحة</h1>
                ${isAdmin ? `<button onclick="location.hash='admin'" class="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-black transition"><i class="fa-solid fa-gear"></i> إدارة الكورسات</button>` : ''}
            </div>
            <p class="text-gray-500 mb-6">ادرس مناهج كبرى الجامعات العالمية مع شهادات إتمام من منصتنا.</p>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                ${globalCourses.map(c => `
                    <div class="bg-white rounded-2xl shadow-lg hover:shadow-2xl transition overflow-hidden group cursor-pointer border border-gray-100 flex flex-col h-full" onclick="location.hash='course/${c.id}'">
                        <div class="h-56 bg-gray-200 relative overflow-hidden course-media-container" data-query="${c.cat || c.title}">
                            <img src="${c.thumbnail}" class="w-full h-full object-cover absolute inset-0 transition duration-700 group-hover:scale-110">
                            <div class="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition flex items-center justify-center">
                                <i class="fa-solid fa-play-circle text-white text-5xl opacity-0 group-hover:opacity-100 transition duration-300 drop-shadow-lg"></i>
                            </div>
                            <span class="absolute top-3 right-3 bg-white/90 backdrop-blur text-xs font-bold px-2 py-1 rounded-lg text-gray-800 shadow-sm">
                                <i class="fa-solid fa-building-columns text-primary"></i> ${c.source ? c.source.split(' ')[0] : 'Academy'}
                            </span>
                        </div>
                        <div class="p-6 flex flex-col flex-1">
                            <h3 class="font-bold text-xl group-hover:text-primary transition line-clamp-1 mb-2">${c.title}</h3>
                            <p class="text-xs text-gray-500 mb-2"><i class="fa-solid fa-tag ml-1"></i> ${c.category}</p>
                            <p class="text-gray-600 text-sm line-clamp-2 mb-4 flex-1">${c.desc}</p>
                            <div class="flex items-center justify-between border-t pt-4 mt-auto">
                                <div>
                                    <span class="text-xs text-gray-400 block">رسوم المنصة</span>
                                    <span class="text-xl font-bold text-green-600">$${c.price}</span>
                                </div>
                                <button class="text-primary font-bold text-sm hover:bg-primary/5 px-3 py-2 rounded-lg transition flex items-center gap-2">
                                    التفاصيل <i class="fa-solid fa-arrow-left"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    document.querySelectorAll('.course-media-container').forEach(async el => {
        const media = await getSmartMedia(el.dataset.query, 'image');
        if(media && media.src && !media.src.includes('placeholder')) {
            const img = el.querySelector('img');
            if(img) img.src = media.src;
        }
    });
}

// 2. عرض تفاصيل الكورس
export async function renderCourseDetail(container, db, currentUser, isAdmin, globalCourses, courseId) {
    // Logic to find course
    let course = globalCourses.find(c => c.id === courseId);
    if (!course) {
        // Fallback fetch logic handled in app.js usually, but we assume data is passed correctly here
        container.innerHTML = `<div class="p-10 text-center text-red-500 font-bold">عذراً، الكورس غير موجود.</div>`;
        return;
    }

    if(!course.lessons) course.lessons = [{ title: "مقدمة عامة", duration: "10:00" }, { title: "محتوى الكورس", duration: "45:00" }];

    let isEnrolled = false;
    let completedLessons = [];
    let userNote = "";

    if (currentUser && !currentUser.isAnonymous) {
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const userData = userSnap.data();
            if (userData.enrolledCourses && userData.enrolledCourses.includes(courseId)) {
                isEnrolled = true;
            }
            if (userData.progress && userData.progress[courseId]) {
                completedLessons = userData.progress[courseId];
            }
            if (userData.notes && userData.notes[courseId]) {
                userNote = userData.notes[courseId];
            }
        }
    }

    const progressPercent = Math.round((completedLessons.length / course.lessons.length) * 100) || 0;

    container.innerHTML = `
        <div class="animate-fadeIn pb-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div class="lg:col-span-2 space-y-6">
                <!-- Video Player -->
                <div class="bg-black rounded-2xl overflow-hidden shadow-2xl aspect-video relative group">
                    <iframe 
                        src="https://www.youtube.com/embed/videoseries?list=${course.playlistId}" 
                        title="YouTube video player" 
                        frameborder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                        allowfullscreen
                        class="w-full h-full absolute inset-0"
                    ></iframe>
                </div>

                <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold">${course.category}</span>
                        <span class="text-gray-500 text-xs font-bold">${course.source}</span>
                    </div>
                    <div class="flex justify-between items-start">
                        <h1 class="text-3xl font-bold text-gray-800 mb-4">${course.title}</h1>
                        ${isAdmin ? `<button onclick="window.deleteCourse('${course.id}')" class="text-red-500 hover:bg-red-50 p-2 rounded"><i class="fa-solid fa-trash"></i></button>` : ''}
                    </div>
                    <p class="text-gray-600 leading-relaxed mb-4">${course.desc}</p>
                    
                    ${isEnrolled ? `
                        <div class="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-2">
                            <div class="flex justify-between text-sm mb-1 font-bold text-gray-700">
                                <span>التقدم في الكورس</span>
                                <span>${progressPercent}%</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2.5">
                                <div class="bg-green-600 h-2.5 rounded-full transition-all duration-1000" style="width: ${progressPercent}%"></div>
                            </div>
                        </div>
                    ` : ''}
                </div>

                <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
                        <i class="fa-solid fa-list-check text-primary"></i> محتوى الكورس
                    </h3>
                    
                    ${!isEnrolled ? `
                        <div class="bg-yellow-50 border-r-4 border-yellow-400 p-4 mb-4 text-yellow-800 text-sm rounded">
                            <i class="fa-solid fa-lock ml-2"></i> المحتوى مغلق. يجب الاشتراك لتفعيل التتبع والمشاهدة الكاملة.
                        </div>
                    ` : ''}

                    <div class="space-y-2">
                        ${course.lessons.map((lesson, idx) => {
                            const isCompleted = completedLessons.includes(idx);
                            return `
                                <div class="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition border border-transparent ${isCompleted ? 'border-green-200 bg-green-50' : ''}">
                                    <div class="ml-4">
                                        ${isEnrolled ? `
                                            <input type="checkbox" 
                                                onchange="window.toggleLesson('${course.id}', ${idx}, this)" 
                                                ${isCompleted ? 'checked' : ''} 
                                                class="w-5 h-5 text-primary rounded focus:ring-primary cursor-pointer accent-green-600">
                                        ` : `
                                            <div class="w-5 h-5 rounded border border-gray-300 bg-gray-200"></div>
                                        `}
                                    </div>
                                    <div class="flex-1">
                                        <h4 class="font-bold text-gray-800 text-sm ${isCompleted ? 'line-through text-gray-500' : ''}">${lesson.title}</h4>
                                        <p class="text-xs text-gray-500">${lesson.duration}</p>
                                    </div>
                                    <i class="fa-solid ${isEnrolled ? 'fa-play-circle text-primary hover:text-green-700 cursor-pointer' : 'fa-lock text-gray-300'} text-xl"></i>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>

                <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div class="flex items-center gap-2 mb-3 text-indigo-700 font-bold">
                        <i class="fa-solid fa-sparkles"></i> المعلم الذكي
                    </div>
                    <div id="mini-chat" class="h-48 overflow-y-auto bg-gray-50 rounded-xl p-4 text-sm space-y-3 mb-3 border border-gray-100"></div>
                    <form id="mini-chat-form" class="relative">
                        <input type="text" class="w-full bg-white border border-gray-200 rounded-lg pl-4 pr-12 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm" placeholder="اكتب سؤالك هنا...">
                        <button type="submit" class="absolute left-2 top-2 bg-indigo-600 text-white w-8 h-8 rounded-lg hover:bg-indigo-700 flex items-center justify-center transition"><i class="fa-solid fa-paper-plane text-xs"></i></button>
                    </form>
                </div>
            </div>

            <div class="lg:col-span-1 space-y-6">
                <div class="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
                    <div class="text-center border-b pb-6 mb-6">
                        <p class="text-gray-400 text-xs font-bold uppercase mb-1">حالة التسجيل</p>
                        ${isEnrolled 
                            ? `<div class="inline-block bg-green-100 text-green-700 px-4 py-1 rounded-full text-xs font-bold"><i class="fa-solid fa-check"></i> مشترك</div>`
                            : `<div class="inline-block bg-blue-100 text-blue-700 px-4 py-1 rounded-full text-xs font-bold"><i class="fa-solid fa-globe"></i> متاح للجميع</div>`
                        }
                    </div>

                    ${!isEnrolled ? `
                        <div class="flex justify-between items-center mb-6">
                            <span class="text-gray-600 font-bold text-sm">رسوم المنصة:</span>
                            <div class="text-right">
                                <span class="text-3xl font-bold text-gray-900">$${course.price}</span>
                            </div>
                        </div>
                        <div id="paypal-button-container" class="mb-4 z-0 relative"></div>
                        <p class="text-[10px] text-gray-400 text-center"><i class="fa-solid fa-lock ml-1"></i> دفع آمن ومشفر 100%</p>
                    ` : `
                        <div class="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                            <i class="fa-solid fa-award text-3xl text-green-600 mb-2"></i>
                            <p class="text-sm font-bold text-green-800">شهادة الإتمام</p>
                            <p class="text-xs text-green-600 mb-3">تفتح عند اكتمال الكورس 100%</p>
                            <button ${progressPercent < 100 ? 'disabled' : ''} onclick="window.openCert('${course.id}', '${course.title}')" class="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-700 transition">
                                إصدار الشهادة
                            </button>
                        </div>
                    `}
                </div>

                <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-2 h-full bg-yellow-400"></div>
                    <div class="flex justify-between items-center mb-3 pl-2">
                        <h3 class="font-bold text-gray-800 flex items-center gap-2">
                            <i class="fa-solid fa-note-sticky text-yellow-500"></i> ملاحظاتي
                        </h3>
                        <span id="note-status" class="text-xs text-gray-400"></span>
                    </div>
                    <p class="text-xs text-gray-500 mb-3 pl-2">اكتب ملاحظاتك الخاصة لهذا الكورس. يتم الحفظ تلقائياً.</p>
                    <textarea 
                        oninput="window.saveNote('${course.id}', this)"
                        class="w-full h-48 p-4 bg-yellow-50 border border-yellow-200 rounded-xl focus:ring-2 focus:ring-yellow-400 outline-none text-sm text-gray-700 resize-none font-medium leading-relaxed shadow-inner"
                        placeholder="أفكار، أسئلة، أو ملخصات..."
                    >${userNote}</textarea>
                </div>
            </div>
        </div>
    `;
    
    // Attach Logic Helpers (Local to UI)
    const chatForm = document.getElementById('mini-chat-form');
    if(chatForm) {
        chatForm.onsubmit = async (e) => {
            e.preventDefault();
            const inp = e.target.querySelector('input');
            const val = inp.value;
            if(!val) return;
            const box = document.getElementById('mini-chat');
            box.innerHTML += `<div class="bg-indigo-100 text-indigo-900 p-3 rounded-2xl rounded-tl-none self-end ml-auto w-fit max-w-[90%] font-medium shadow-sm">${val}</div>`;
            inp.value = '';
            box.scrollTop = box.scrollHeight;
            const loadId = 'load-' + Date.now();
            box.innerHTML += `<div id="${loadId}" class="text-gray-400 text-xs italic p-2"><i class="fa-solid fa-circle-notch fa-spin"></i> جاري الكتابة...</div>`;
            box.scrollTop = box.scrollHeight;
            const { text } = await askGemini(val, `Context: You are discussing the course "${course.title}".`);
            document.getElementById(loadId).remove();
            box.innerHTML += `<div class="bg-white border border-gray-200 p-3 rounded-2xl rounded-tr-none w-fit max-w-[90%] text-gray-700 shadow-sm prose prose-sm">${marked.parse(text)}</div>`;
            box.scrollTop = box.scrollHeight;
        }
    }

    if (!isEnrolled && window.paypal) {
         window.paypal.Buttons({
            style: { shape: 'rect', color: 'blue', layout: 'vertical', label: 'checkout' },
            createOrder: (d, a) => a.order.create({ purchase_units: [{ description: `Academy: ${course.title}`, amount: { value: course.price } }] }),
            onApprove: async (d, a) => {
                const order = await a.order.capture();
                if (currentUser) {
                    await setDoc(doc(db, 'users', currentUser.uid), { enrolledCourses: arrayUnion(course.id) }, { merge: true });
                    const certUrl = `certificate.html?student=${encodeURIComponent(currentUser.displayName || order.payer.name.given_name)}&course=${encodeURIComponent(course.title)}&date=${new Date().toISOString().split('T')[0]}&id=${order.id}`;
                    window.location.href = certUrl;
                } else alert('يرجى تسجيل الدخول.');
            }
        }).render('#paypal-button-container');
    }

    // Cert Opener Helper
    window.openCert = (id, title) => {
        const studentName = currentUser.displayName || "Student";
        const date = new Date().toISOString().split('T')[0];
        const certId = `CERT-${currentUser.uid.substring(0,5)}-${id}`.toUpperCase();
        const certUrl = `certificate.html?student=${encodeURIComponent(studentName)}&course=${encodeURIComponent(title)}&date=${date}&id=${certId}`;
        window.open(certUrl, '_blank');
    }
}

// 3. لوحة تحكم الأدمن
export async function renderAdminDashboard(container, db, isAdmin, globalCourses) {
    if (!isAdmin) return container.innerHTML = `<div class="p-10 text-center text-red-500 text-xl font-bold">⛔ منطقة محظورة: للمشرفين فقط</div>`;
    
    container.innerHTML = `
        <div class="animate-fadeIn space-y-8">
            <div class="bg-gray-800 text-white p-8 rounded-3xl shadow-xl flex justify-between items-center">
                <div>
                    <h1 class="text-3xl font-bold mb-2"><i class="fa-solid fa-user-shield"></i> لوحة تحكم المشرف</h1>
                    <p class="text-gray-400">تحكم كامل في الكورسات والشهادات</p>
                </div>
                <div class="flex gap-4">
                    <div class="text-center bg-gray-700 p-4 rounded-xl">
                        <span class="block text-2xl font-bold text-primary">${globalCourses.length}</span>
                        <span class="text-xs text-gray-400">كورسات</span>
                    </div>
                </div>
            </div>

            <div class="flex gap-4 border-b border-gray-200 pb-2">
                <button onclick="window.switchAdminTab('courses')" id="adm-tab-courses" class="px-4 py-2 text-primary font-bold border-b-2 border-primary">إدارة الكورسات</button>
                <button onclick="window.switchAdminTab('certs')" id="adm-tab-certs" class="px-4 py-2 text-gray-500 hover:text-gray-800">إصدار الشهادات</button>
            </div>

            <div id="adm-view-courses" class="space-y-6">
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 class="text-xl font-bold mb-4">إضافة كورس جديد</h2>
                    <form id="add-course-form" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input name="title" type="text" placeholder="عنوان الكورس" class="input-field border p-2 rounded" required>
                        <input name="id" type="text" placeholder="ID فريد (مثال: py-course)" class="input-field border p-2 rounded" required>
                        <input name="price" type="number" placeholder="السعر ($)" class="input-field border p-2 rounded" required>
                        <input name="category" type="text" placeholder="التصنيف (AI, Web...)" class="input-field border p-2 rounded" required>
                        <input name="source" type="text" placeholder="المصدر (MIT, Harvard...)" class="input-field border p-2 rounded" required>
                        <input name="playlistId" type="text" placeholder="Youtube Playlist ID" class="input-field border p-2 rounded" required>
                        <input name="thumbnail" type="text" placeholder="رابط الصورة المصغرة" class="input-field border p-2 rounded">
                        <textarea name="desc" placeholder="وصف الكورس" class="input-field border p-2 rounded md:col-span-2" rows="3" required></textarea>
                        <button type="submit" class="bg-primary text-white py-2 rounded-xl font-bold md:col-span-2 hover:bg-green-700 transition">إضافة الكورس</button>
                    </form>
                </div>

                <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 class="text-xl font-bold mb-4">الكورسات الحالية</h2>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm text-right">
                            <thead class="bg-gray-50 text-gray-600">
                                <tr>
                                    <th class="p-3">العنوان</th>
                                    <th class="p-3">السعر</th>
                                    <th class="p-3">المصدر</th>
                                    <th class="p-3">إجراءات</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y">
                                ${globalCourses.map(c => `
                                    <tr class="hover:bg-gray-50">
                                        <td class="p-3 font-bold">${c.title}</td>
                                        <td class="p-3">$${c.price}</td>
                                        <td class="p-3">${c.source}</td>
                                        <td class="p-3 flex gap-2">
                                            <button onclick="window.deleteCourse('${c.id}')" class="text-red-500 hover:bg-red-100 p-2 rounded"><i class="fa-solid fa-trash"></i></button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div id="adm-view-certs" class="hidden bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 class="text-xl font-bold mb-4">مولد الشهادات اليدوي</h2>
                <div class="space-y-4 max-w-lg">
                    <input id="cert-student" type="text" placeholder="اسم الطالب" class="w-full border p-3 rounded-lg">
                    <input id="cert-course" type="text" placeholder="اسم الكورس" class="w-full border p-3 rounded-lg">
                    <button onclick="window.generateManualCert()" class="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-200">
                        <i class="fa-solid fa-print"></i> إصدار وطباعة الشهادة
                    </button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('add-course-form').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());
        data.cat = data.category.toLowerCase() + " abstract"; 
        if(window.addCourse) await window.addCourse(data);
        e.target.reset();
    };

    window.switchAdminTab = (tab) => {
        const t1 = document.getElementById('adm-tab-courses');
        const t2 = document.getElementById('adm-tab-certs');
        const v1 = document.getElementById('adm-view-courses');
        const v2 = document.getElementById('adm-view-certs');
        
        if(tab === 'courses') {
            t1.classList.add('text-primary','border-b-2','border-primary'); t1.classList.remove('text-gray-500');
            t2.classList.remove('text-primary','border-b-2','border-primary'); t2.classList.add('text-gray-500');
            v1.classList.remove('hidden'); v2.classList.add('hidden');
        } else {
            t2.classList.add('text-primary','border-b-2','border-primary'); t2.classList.remove('text-gray-500');
            t1.classList.remove('text-primary','border-b-2','border-primary'); t1.classList.add('text-gray-500');
            v2.classList.remove('hidden'); v1.classList.add('hidden');
        }
    }

    window.generateManualCert = () => {
        const s = document.getElementById('cert-student').value;
        const c = document.getElementById('cert-course').value;
        if(!s || !c) return alert("يرجى ملء البيانات");
        const date = new Date().toISOString().split('T')[0];
        const id = 'MANUAL-' + Date.now().toString().slice(-6);
        const url = `certificate.html?student=${encodeURIComponent(s)}&course=${encodeURIComponent(c)}&date=${date}&id=${id}`;
        window.open(url, '_blank');
    }
}

// 4. عرض الملف الشخصي
export async function renderProfile(container, db, currentUser, isAdmin, globalCourses) {
    let userData = { displayName: 'Guest', enrolledCourses: [] };
    if (!currentUser.isAnonymous) {
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        userData = userSnap.data() || { displayName: currentUser.displayName, enrolledCourses: [] };
        userData.uid = currentUser.uid;
        userData.displayName = currentUser.displayName;
        userData.email = currentUser.email;
    } else {
        userData.displayName = "زائر كريم";
        userData.uid = "GUEST";
        userData.email = "guest@academy.com";
    }
    
    const enrolledIds = userData.enrolledCourses || [];
    const myCourses = globalCourses.filter(c => enrolledIds.includes(c.id));
    const xp = userData.xp || 0;
    const badges = getBadges(xp);
    const social = userData.social || { linkedin: '', github: '' };

    const generateCertLink = (course) => {
        const params = new URLSearchParams();
        params.append('student', userData.displayName);
        params.append('course', course.title); 
        params.append('id', `CERT-${userData.uid.substring(0,5)}-${course.id}`.toUpperCase());
        params.append('date', new Date().toISOString().split('T')[0]);
        return `certificate.html?${params.toString()}`;
    };

    container.innerHTML = `
        <div class="animate-fadeIn max-w-4xl mx-auto space-y-8">
            <div class="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden">
                <div class="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary to-accent"></div>
                <div class="w-24 h-24 bg-gradient-to-br from-primary to-emerald-700 text-white rounded-full flex items-center justify-center text-4xl font-bold shadow-xl border-4 border-white z-10">
                    ${userData.displayName?.[0] || 'U'}
                </div>
                <div class="text-center md:text-right flex-1 z-10">
                    <h1 class="text-3xl font-bold text-gray-800 mb-1">${userData.displayName}</h1>
                    <p class="text-gray-500 flex items-center justify-center md:justify-start gap-2"><i class="fa-solid fa-envelope"></i> ${userData.email}</p>
                    ${isAdmin ? '<span class="bg-red-100 text-red-600 text-xs px-2 py-1 rounded font-bold mt-2 inline-block">Admin Access</span>' : ''}
                    
                    <!-- XP Badge -->
                    <div class="mt-3 inline-flex items-center gap-2 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 text-indigo-700 text-sm font-bold">
                        <i class="fa-solid fa-bolt"></i> ${xp} XP
                    </div>
                </div>
            </div>

            <!-- Gamification & Social -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Badges -->
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2"><i class="fa-solid fa-medal text-yellow-500"></i> الأوسمة المكتسبة</h3>
                    <div class="flex flex-wrap gap-3">
                        ${badges.map(b => `
                            <div class="${b.bg} ${b.color} px-3 py-2 rounded-xl flex items-center gap-2 text-sm font-bold shadow-sm">
                                <i class="fa-solid ${b.icon}"></i> ${b.name}
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Social Links Form -->
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2"><i class="fa-solid fa-share-nodes text-blue-500"></i> الملف الاجتماعي</h3>
                    <form onsubmit="window.saveSocialLinks(event)" class="space-y-3">
                        <div class="flex items-center gap-2 border bg-gray-50 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-blue-200">
                            <i class="fa-brands fa-linkedin text-blue-600 text-xl"></i>
                            <input name="linkedin" value="${social.linkedin || ''}" type="url" placeholder="رابط LinkedIn" class="bg-transparent w-full outline-none text-sm">
                        </div>
                        <div class="flex items-center gap-2 border bg-gray-50 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-gray-300">
                            <i class="fa-brands fa-github text-gray-800 text-xl"></i>
                            <input name="github" value="${social.github || ''}" type="url" placeholder="رابط GitHub" class="bg-transparent w-full outline-none text-sm">
                        </div>
                        <button type="submit" class="w-full bg-gray-800 text-white py-2 rounded-lg text-sm font-bold hover:bg-black transition">حفظ التغييرات</button>
                    </form>
                </div>
            </div>

            <div class="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                <div class="flex items-center justify-between mb-6 border-b pb-4">
                    <h2 class="text-2xl font-bold flex items-center gap-2 text-gray-800">
                        <i class="fa-solid fa-certificate text-yellow-500 text-3xl"></i> شهاداتي المعتمدة
                    </h2>
                    <span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-bold">${myCourses.length} شهادة</span>
                </div>
                
                ${myCourses.length === 0 ? `
                    <div class="text-center py-10 text-gray-400">
                        <i class="fa-solid fa-folder-open text-4xl mb-2"></i>
                        <p>لا توجد شهادات حالياً.</p>
                        <button onclick="location.hash='courses'" class="mt-4 text-primary font-bold hover:underline">تصفح المسارات</button>
                    </div>
                ` : `
                    <div class="grid gap-4">
                        ${myCourses.map(course => {
                            const certUrl = generateCertLink(course);
                            return `
                                <div class="border border-gray-200 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 hover:shadow-lg transition bg-gradient-to-r from-white to-gray-50/50">
                                    <div class="flex items-center gap-4 w-full md:w-auto">
                                        <div class="bg-green-50 p-4 rounded-xl text-green-600 shadow-sm border border-green-100">
                                            <i class="fa-solid fa-award text-3xl"></i>
                                        </div>
                                        <div>
                                            <h3 class="font-bold text-lg text-gray-800">${course.title}</h3>
                                            <p class="text-sm text-gray-500 mb-1"><i class="fa-solid fa-building-columns ml-1"></i> المصدر: ${course.source}</p>
                                        </div>
                                    </div>
                                    <div class="flex gap-3 w-full md:w-auto">
                                        <button onclick="window.open('${certUrl}', '_blank')" class="flex-1 md:flex-none px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition text-sm font-bold flex items-center justify-center gap-2">
                                            <i class="fa-solid fa-eye"></i> عرض
                                        </button>
                                        <a href="https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(course.title)}&organizationName=Future Academy&issueYear=2025&certUrl=${encodeURIComponent(window.location.origin + '/' + certUrl)}" 
                                           target="_blank"
                                           class="flex-1 md:flex-none px-5 py-2.5 bg-[#0a66c2] text-white rounded-lg hover:bg-[#004182] transition text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-200">
                                            <i class="fa-brands fa-linkedin text-lg"></i> LinkedIn
                                        </a>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </div>
        </div>
    `;
}

// 5. عرض لوحة التحكم الرئيسية
export async function renderDashboard(container, db, currentUser, isAdmin, globalCourses) {
    let displayName = currentUser.isAnonymous ? "زائر كريم" : currentUser.displayName;
    if (!currentUser.isAnonymous) {
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        if(snap.exists()) displayName = snap.data().displayName;
    }

    container.innerHTML = `
        <div class="space-y-8 animate-fadeIn">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <!-- Main Welcome & Leaderboard -->
                <div class="lg:col-span-2 space-y-8">
                    <div class="bg-gradient-to-r from-primary to-emerald-800 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                        <div class="relative z-10">
                            <h1 class="text-4xl font-bold mb-2">مرحباً بك، ${displayName} 🚀</h1>
                            <p class="opacity-90 max-w-lg">ابدأ رحلتك التعليمية اليوم مع أفضل الجامعات العالمية.</p>
                            <div class="flex gap-3 mt-6">
                                <button onclick="location.hash='courses'" class="bg-white text-primary px-6 py-3 rounded-xl font-bold hover:bg-gray-100 transition shadow-lg">تصفح المسارات</button>
                                ${isAdmin ? `<button onclick="location.hash='admin'" class="bg-black/30 text-white border border-white/30 px-6 py-3 rounded-xl font-bold hover:bg-black/50 transition"><i class="fa-solid fa-gear"></i> لوحة الأدمن</button>` : ''}
                            </div>
                        </div>
                        <i class="fa-solid fa-rocket absolute -bottom-4 -left-4 text-9xl opacity-10 rotate-45"></i>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:shadow-md transition" onclick="location.hash='courses'">
                            <div class="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl"><i class="fa-solid fa-book"></i></div>
                            <div><p class="text-gray-500 text-sm">المسارات</p><p class="text-2xl font-bold">${globalCourses.length}</p></div>
                        </div>
                        <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:shadow-md transition" onclick="location.hash='profile'">
                            <div class="w-12 h-12 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center text-xl"><i class="fa-solid fa-certificate"></i></div>
                            <div><p class="text-gray-500 text-sm">شهاداتي</p><p class="text-2xl font-bold">عرض</p></div>
                        </div>
                    </div>
                </div>

                <!-- Leaderboard Widget (Side) -->
                <div class="lg:col-span-1">
                    <div id="leaderboard-widget"></div>
                </div>
            </div>
        </div>
    `;

    await renderLeaderboardWidget(db, 'leaderboard-widget');
}

// 6. عرض شاشة الدخول
export function renderAuth(container, auth, signInWithPopup, signInAnonymously, GoogleAuthProvider, setDoc) {
    document.getElementById('app').classList.add('hidden');
    document.getElementById('loader').classList.add('hidden');
    const tmpl = document.getElementById('auth-template').content.cloneNode(true);
    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.className = 'fixed inset-0 bg-white z-[200]';
    overlay.appendChild(tmpl);
    document.body.appendChild(overlay);

    const googleBtn = overlay.querySelector('#google-login-btn');
    const guestBtn = overlay.querySelector('#guest-login-btn');
    const guestFallback = overlay.querySelector('#guest-fallback');
    const errEl = overlay.querySelector('#auth-error');
    setTimeout(() => guestFallback.classList.remove('hidden'), 2000);

    googleBtn.onclick = async (e) => {
        e.preventDefault();
        errEl.classList.add('hidden');
        googleBtn.disabled = true;
        googleBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري الاتصال بجوجل...';
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            await setDoc(doc(auth.app.firestore(), 'users', user.uid), { displayName: user.displayName, email: user.email, photoURL: user.photoURL, lastLogin: new Date().toISOString() }, { merge: true });
            overlay.remove();
        } catch(err) { 
            googleBtn.disabled = false;
            googleBtn.innerHTML = '<img src="https://www.svgrepo.com/show/475656/google-color.svg" class="w-6 h-6" alt="Google"> <span>المتابعة باستخدام Google</span>';
            errEl.innerHTML = `خطأ: ${err.message}`;
            errEl.classList.remove('hidden');
        }
    };

    guestBtn.onclick = async (e) => {
        e.preventDefault();
        errEl.classList.add('hidden');
        guestBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري الدخول...';
        try { await signInAnonymously(auth); overlay.remove(); } catch (err) { guestBtn.innerHTML = 'دخول زائر'; errEl.textContent = err.message; errEl.classList.remove('hidden'); }
    };
}