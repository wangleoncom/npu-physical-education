/* ==========================================================================
   js/main.js - NPU Sports Frontend Engine v2.0 (Single Page Application)
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, onSnapshot, serverTimestamp, updateDoc, doc, getDoc, getCountFromServer, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const app = initializeApp({ apiKey: "AIzaSyAsqw3P00oiGHiE8AJTfa6YBx_ynJ2LPiQ", authDomain: "sports-lecture.firebaseapp.com", projectId: "sports-lecture" });
const db = initializeFirestore(app, { localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()}) });

let sysConfig = null;
let currentQAUser = { uid: null, name: null };
let likedMessages = JSON.parse(localStorage.getItem('npu_likes') || '[]');

// ================== 通用工具 ==================
const sanitize = (s) => s ? String(s).trim().replace(/[&<>'"]/g, t => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[t] || t)) : '';
function showToast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    if(!container) return;
    const t = document.createElement('div');
    t.className = `toast-item flex items-center gap-3 ${type === 'error' ? 'text-red-400 border-red-500/30' : 'text-cyan-400 border-cyan-500/30'}`;
    t.innerHTML = `<span class="text-lg">${type === 'error' ? '⚠️' : '✨'}</span> <span class="text-sm font-bold text-white">${sanitize(msg)}</span>`;
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add('active'));
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(-10px) scale(0.95)'; setTimeout(() => t.remove(), 400); }, 3500);
}

// 視覺特效初始化
function initVisuals() {
    document.addEventListener('mousemove', (e) => {
        const orbs = document.querySelectorAll('.orb');
        const x = (e.clientX / window.innerWidth - 0.5) * 40, y = (e.clientY / window.innerHeight - 0.5) * 40;
        orbs.forEach(o => o.style.transform = `translate(${x}px, ${y}px)`);
    });

    const reveal = () => document.querySelectorAll('.spa-view.active .reveal:not(.active)').forEach(el => {
        if(el.getBoundingClientRect().top < window.innerHeight - 50) el.classList.add('active');
    });
    window.addEventListener('scroll', reveal);
    setInterval(reveal, 300); // 確保 SPA 切換時觸發
}

// ================== SPA 路由切換引擎 ==================
function navigateTo(viewId) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelectorAll('.spa-view').forEach(v => v.classList.remove('active', 'flex'));
    document.querySelectorAll('.spa-view').forEach(v => v.classList.add('hidden'));
    
    const target = document.getElementById(viewId);
    if(target) {
        target.classList.remove('hidden');
        if(viewId === 'view-qa') target.classList.add('flex'); // QA 頁面需要 flex 佈局
        else target.classList.add('active');
    }

    // 導覽列狀態更新
    document.querySelectorAll('.nav-link').forEach(btn => {
        if(btn.dataset.target === viewId) btn.classList.add('text-cyan-400');
        else btn.classList.remove('text-cyan-400');
    });
}

document.querySelectorAll('.nav-link').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        const target = e.currentTarget.dataset.target;
        if(target) navigateTo(target);
    });
});

// ================== 系統初始化 ==================
document.addEventListener('DOMContentLoaded', async () => {
    initVisuals();
    try {
        const prog = document.getElementById('loaderProgress');
        if(prog) prog.style.width = '50%';
        
        onSnapshot(doc(db, "settings", "2027_config"), (snap) => {
            if(snap.exists()) {
                sysConfig = snap.data();
                updateHomeStatus();
                updateRegisterForm();
            }
        });

        if(prog) prog.style.width = '100%';
        
        // 檢查本地是否有快取票券
        const localTicket = localStorage.getItem('npu_offline_ticket');
        if(localTicket) {
            const tData = JSON.parse(localTicket);
            renderTicket(tData.id, tData);
        }

    } catch (e) { showToast("系統連線異常", "error"); }
    finally {
        const loader = document.getElementById('premiumLoader');
        if(loader) { loader.style.opacity = '0'; setTimeout(() => loader.remove(), 800); }
    }
});

// ================== 1. 首頁邏輯 ==================
function updateHomeStatus() {
    // 倒數計時
    if(sysConfig?.eventDate && !window.timerInterval) {
        const target = new Date(sysConfig.eventDate).getTime();
        window.timerInterval = setInterval(() => {
            const dist = target - new Date().getTime();
            if(dist > 0) {
                document.getElementById('timer-d').innerText = String(Math.floor(dist / 86400000)).padStart(2, '0');
                document.getElementById('timer-h').innerText = String(Math.floor((dist % 86400000) / 3600000)).padStart(2, '0');
                document.getElementById('timer-m').innerText = String(Math.floor((dist % 3600000) / 60000)).padStart(2, '0');
                document.getElementById('timer-s').innerText = String(Math.floor((dist % 60000) / 1000)).padStart(2, '0');
            }
        }, 1000);
    }
    
    // 總人數即時更新
    onSnapshot(query(collection(db, "registrations_2027"), where("status", "!=", "已取消")), (snap) => {
        const el = document.getElementById('totalRegCount');
        if(el) el.innerText = snap.size;
    });

    // 渲染議程
    const tbody = document.getElementById('scheduleBody');
    if(tbody && sysConfig?.schedule) {
        tbody.innerHTML = sysConfig.schedule.map(item => `
            <div class="flex flex-col md:flex-row gap-4 p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                <div class="font-mono text-cyan-400 font-black text-sm tracking-wider shrink-0 w-32">${sanitize(item.time)}</div>
                <div><h4 class="text-base font-black text-white">${sanitize(item.title)}</h4>${item.speaker ? `<p class="text-slate-400 text-xs font-bold mt-1">🗣️ ${sanitize(item.speaker)}</p>` : ''}</div>
            </div>
        `).join('');
    }

    // CTA 按鈕狀態控制
    document.querySelectorAll('.global-cta-btn').forEach(btn => {
        if(!sysConfig.isOpen) {
            btn.innerText = "報名已截止";
            btn.classList.add('bg-slate-700', 'text-slate-400', 'pointer-events-none');
            btn.classList.remove('bg-cyan-400', 'text-slate-900');
        } else {
            btn.innerText = "立即參與";
            btn.classList.remove('bg-slate-700', 'text-slate-400', 'pointer-events-none');
            btn.classList.add('bg-cyan-400', 'text-slate-900');
        }
    });

    // FAQ
    document.querySelectorAll('.faq-btn').forEach(btn => {
        btn.onclick = () => {
            const content = btn.nextElementSibling;
            content.classList.toggle('hidden');
            setTimeout(() => { content.classList.toggle('open'); content.classList.toggle('grid'); }, 10);
            btn.querySelector('.faq-icon').style.transform = content.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0deg)';
        };
    });
}

// ================== 2. 報名頁邏輯 ==================
function getDynamicFieldsHTML(prefix = '') {
    if(!sysConfig?.formFields) return '';
    return sysConfig.formFields.map(f => {
        const fieldName = prefix ? `${prefix}_${f.id}` : f.id;
        if(f.type === 'select') {
            return `<div class="input-group"><select name="${fieldName}" data-fid="${f.id}" class="form-input" ${f.required?'required':''}><option value="" disabled selected></option>${f.options.map(o=>`<option value="${o}">${o}</option>`).join('')}</select><label>${sanitize(f.label)}</label><span class="error-msg">必選</span></div>`;
        }
        return `<div class="input-group"><input type="${f.type}" name="${fieldName}" data-fid="${f.id}" class="form-input" placeholder=" " ${f.required?'required':''}><label>${sanitize(f.label)}</label><span class="error-msg">必填</span></div>`;
    }).join('');
}

async function updateRegisterForm() {
    if(!sysConfig?.isOpen) {
        document.getElementById('formOverlay')?.classList.remove('hidden');
        const badge = document.getElementById('regStatusBadge');
        if(badge) { badge.innerText = "系統鎖定中"; badge.className = "inline-flex items-center px-4 py-1.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest"; }
    } else {
        document.getElementById('formOverlay')?.classList.add('hidden');
        const badge = document.getElementById('regStatusBadge');
        if(badge) { badge.innerText = "報名開放中"; badge.className = "inline-flex items-center px-4 py-1.5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-widest"; }
    }

    const cGroup = document.getElementById('categoryGroup');
    if(cGroup && sysConfig?.categories) {
        let html = '';
        for(const cat of sysConfig.categories) {
            const qCount = query(collection(db, "registrations_2027"), where("category", "==", cat.name), where("status", "!=", "已取消"));
            const countSnap = await getCountFromServer(qCount);
            const remain = cat.limit - countSnap.data().count;
            html += `<label class="block cursor-pointer group"><input type="radio" name="category" value="${sanitize(cat.name)}" class="peer sr-only" required><div class="flex justify-between items-center p-5 rounded-2xl border border-white/10 bg-white/5 peer-checked:border-cyan-400 peer-checked:bg-cyan-500/10 transition-all"><span class="font-black text-white">${sanitize(cat.name)}</span>${remain <= 0 ? `<span class="px-2 py-1 bg-amber-500/20 text-amber-400 text-[10px] rounded-md font-bold">候補</span>` : `<span class="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] rounded-md font-bold">剩 ${remain}</span>`}</div></label>`;
        }
        cGroup.innerHTML = html;
    }

    const dfc = document.querySelector('.dynamic-fields-injection');
    if(dfc && dfc.innerHTML === '') dfc.innerHTML = getDynamicFieldsHTML('main');
}

// 處理同行親友新增 (包含動態欄位拷貝)
let compCount = 0;
document.getElementById('addCompanionBtn')?.addEventListener('click', () => {
    if(compCount >= 3) return showToast("單次最高限制 3 位同行親友", "error");
    compCount++;
    const div = document.createElement('div');
    div.className = 'attendee-block bg-black/30 p-6 rounded-2xl border border-white/5 relative mt-6 reveal active';
    div.dataset.index = compCount;
    div.innerHTML = `
        <h4 class="text-sm font-black text-slate-400 mb-6 flex justify-between items-center">
            <span>👤 同行親友 ${compCount}</span><button type="button" class="text-red-400 text-xs hover:underline" onclick="this.closest('.attendee-block').remove(); compCount--;">移除</button>
        </h4>
        <div class="space-y-5">
            <div class="input-group"><input type="text" name="fullname[]" class="form-input" required placeholder=" "><label>真實姓名</label><span class="error-msg">必填</span></div>
            <div class="input-group"><input type="tel" name="phone[]" pattern="^09\\d{8}$" class="form-input" required placeholder=" "><label>聯絡電話</label><span class="error-msg">格式錯誤</span></div>
            <div class="input-group"><input type="email" name="email[]" class="form-input" required placeholder=" "><label>電子信箱</label><span class="error-msg">必填</span></div>
            <div class="space-y-5 pt-2 border-t border-white/5 mt-4">${getDynamicFieldsHTML(`comp_${compCount}`)}</div>
        </div>
    `;
    document.getElementById('attendeesContainer').appendChild(div);
});

// 表單驗證與提交
document.getElementById('regForm')?.addEventListener('input', e => {
    if(e.target.classList.contains('form-input') && e.target.checkValidity()) e.target.classList.remove('invalid');
});

document.getElementById('regForm').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    let isValid = true;
    form.querySelectorAll('[required]').forEach(i => { if(!i.checkValidity()) { i.classList.add('invalid'); isValid=false; }});
    if(!isValid) return showToast("請檢查紅字標示的必填欄位", "error");

    const turnstile = form.querySelector('[name="cf-turnstile-response"]')?.value;
    if (!turnstile) return showToast("請完成防機器人驗證", "error");

    const btn = document.getElementById('submitBtn');
    btn.disabled = true; btn.innerText = "安全加密連線中...";

    try {
        const category = document.querySelector('input[name="category"]:checked').value;
        const countQ = query(collection(db, "registrations_2027"), where("category", "==", category), where("status", "!=", "已取消"));
        const currentCount = (await getCountFromServer(countQ)).data().count;
        const limit = sysConfig.categories.find(c => c.name === category).limit;

        const blocks = Array.from(document.querySelectorAll('.attendee-block'));
        const emails = blocks.map(b => b.querySelector('input[type="email"]').value.trim().toLowerCase());
        
        // 檢查主報名人是否重複
        const checkQ = query(collection(db, "registrations_2027"), where("email", "==", emails[0]), where("status", "!=", "已取消"));
        if(!(await getDocs(checkQ)).empty) throw new Error("DUPLICATE");

        let firstDocId = null, firstData = null;

        const promises = blocks.map((block, i) => {
            const status = (currentCount + i) >= limit ? '備取' : '正取';
            const name = sanitize(block.querySelector('input[type="text"]').value);
            const phone = block.querySelector('input[type="tel"]').value.trim();
            
            let data = { category, name, phone, email: emails[i], status, checkins: {}, createdAt: serverTimestamp() };
            
            // 收集該區塊內的動態欄位
            block.querySelectorAll('[data-fid]').forEach(el => { data[el.dataset.fid] = sanitize(el.value); });
            
            if(i === 0) firstData = data;
            return addDoc(collection(db, "registrations_2027"), data).then(ref => { if(i===0) firstDocId = ref.id; });
        });

        await Promise.all(promises);
        
        // 渲染票券並切換視圖
        renderTicket(firstDocId, firstData);
        document.getElementById('formStateContainer').classList.add('hidden');
        showToast(blocks.length > 1 ? `已為您與親友共 ${blocks.length} 人報名成功！` : "報名手續已完成！");
        
    } catch (err) {
        if(err.message === "DUPLICATE") showToast("此主信箱已有報名紀錄", "error");
        else showToast("伺服器異常", "error");
        btn.disabled = false; btn.innerText = "確認並加密送出";
    }
};

// ================== 3. 查票與動態票券渲染 (query.html / ticket) ==================
document.getElementById('queryForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('queryBtn');
    btn.innerText = "雲端檢索中..."; btn.disabled = true;
    
    try {
        const email = document.getElementById('qEmail').value.trim().toLowerCase();
        const phone = document.getElementById('qPhone').value.trim();
        const q = query(collection(db, "registrations_2027"), where("email", "==", email), where("status", "!=", "已取消"));
        const snap = await getDocs(q);
        const docSnap = snap.docs.find(d => d.data().phone === phone);

        if(docSnap) {
            document.querySelector('#view-query .bento-card').classList.add('hidden');
            renderTicket(docSnap.id, docSnap.data());
        } else { showToast("查無紀錄，請確認資料", "error"); }
    } catch(err) { showToast("檢索失敗", "error"); }
    finally { btn.disabled = false; btn.innerText = '雲端檢索'; }
};

// 核心：渲染動態 3D 票券
function renderTicket(docId, data) {
    document.getElementById('successStateContainer').classList.remove('hidden');
    
    // 基本資訊
    document.getElementById('ticketName').innerText = data.name;
    document.getElementById('ticketCategory').innerText = `${data.category} | ${data.status}`;
    
    // QR Code (使用 QRious)
    const canvas = document.getElementById('ticketQRCanvas');
    if(canvas) new QRious({ element: canvas, value: docId, size: 200, level: 'H' });

    // 🏆 中獎特效判斷
    const t3d = document.getElementById('ticket3D');
    const effect = document.getElementById('winnerEffect');
    const wTitle = document.getElementById('ticketWinnerTitle');
    if(data.isWinner) {
        t3d.classList.add('border-amber-400', 'shadow-[0_0_50px_rgba(251,191,36,0.4)]');
        effect.classList.remove('hidden'); wTitle.classList.remove('hidden');
    } else {
        t3d.classList.remove('border-amber-400', 'shadow-[0_0_50px_rgba(251,191,36,0.4)]');
        effect.classList.add('hidden'); wTitle.classList.add('hidden');
    }

    // 🏷️ 動態自訂標籤
    const tagsContainer = document.getElementById('ticketTags');
    if(tagsContainer && sysConfig?.formFields) {
        tagsContainer.innerHTML = sysConfig.formFields.filter(f => data[f.id]).map(f => `<span class="px-3 py-1 bg-white/10 border border-white/20 rounded-full text-xs font-bold text-slate-300 shadow-sm">${sanitize(f.label)}: ${sanitize(data[f.id])}</span>`).join('');
    }

    // 📍 多節點闖關進度條
    const nodesContainer = document.getElementById('ticketNodesProgress');
    let hasAnyCheckin = false;
    if(nodesContainer && sysConfig?.checkinNodes) {
        nodesContainer.innerHTML = sysConfig.checkinNodes.map(node => {
            const isChecked = data.checkins && data.checkins[node.id];
            if(isChecked) hasAnyCheckin = true;
            return `
                <div class="flex items-center justify-between p-2 rounded-lg ${isChecked ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-white/5'}">
                    <span class="text-xs font-bold ${isChecked ? 'text-emerald-400' : 'text-slate-500'}">${sanitize(node.name)}</span>
                    <span class="text-[10px] uppercase font-black tracking-widest ${isChecked ? 'text-emerald-400' : 'text-slate-600'}">${isChecked ? '✅ Unlocked' : 'Locked'}</span>
                </div>
            `;
        }).join('');
    }

    // 功能按鈕顯隱
    const btnQA = document.getElementById('btnEnterQA');
    const btnCert = document.getElementById('btnDownloadCert');
    
    // 如果有任何核銷紀錄，開放 QA
    if(hasAnyCheckin && btnQA) {
        btnQA.classList.remove('hidden');
        btnQA.onclick = () => { currentQAUser = { uid: docId, name: data.name }; navigateTo('view-qa'); initQASystem(); };
    }
    
    // 結業證書邏輯：活動結束且有核銷
    const isEnded = sysConfig?.eventDate ? (new Date().getTime() > new Date(sysConfig.eventDate).getTime() + 86400000) : false;
    if(isEnded && hasAnyCheckin && btnCert) {
        btnCert.classList.remove('hidden');
        btnCert.onclick = () => generateCertificate(data.name);
    }

    document.getElementById('btnCancelReg').onclick = async () => {
        if(confirm("確定取消報名？這將立即釋出名額。")) {
            await updateDoc(doc(db, "registrations_2027", docId), { status: "已取消" });
            localStorage.removeItem('npu_offline_ticket');
            showToast("已取消報名。"); setTimeout(() => location.reload(), 1500);
        }
    };

    // 3D 傾斜特效
    t3d.addEventListener('mousemove', (e) => {
        const r = t3d.getBoundingClientRect();
        t3d.style.transform = `rotateY(${((e.clientX - r.left)/r.width - 0.5)*15}deg) rotateX(${(-(e.clientY - r.top)/r.height + 0.5)*15}deg)`;
    });
    t3d.addEventListener('mouseleave', () => t3d.style.transform = `rotateY(0deg) rotateX(0deg)`);
    
    // 快取
    localStorage.setItem('npu_offline_ticket', JSON.stringify({ id: docId, name: data.name }));
    navigateTo('view-register'); // 將視圖推回展示區 (首頁報名區覆用)
}

function generateCertificate(name) {
    const canvas = document.getElementById('certCanvas');
    const ctx = canvas.getContext('2d');
    
    const grad = ctx.createLinearGradient(0, 0, 1200, 800);
    grad.addColorStop(0, '#0f172a'); grad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 1200, 800);
    
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)'; ctx.lineWidth = 10; ctx.strokeRect(40, 40, 1120, 720);
    ctx.textAlign = 'center'; ctx.fillStyle = '#00E5FF';
    ctx.font = '900 60px "Noto Sans TC", sans-serif'; ctx.fillText('研習結業證書', 600, 200);
    
    ctx.fillStyle = '#94a3b8'; ctx.font = '600 30px "Noto Sans TC", sans-serif'; ctx.fillText('茲證明', 600, 320);
    ctx.fillStyle = '#ffffff'; ctx.font = '900 80px "Noto Sans TC", sans-serif'; ctx.fillText(name, 600, 430);
    ctx.fillStyle = '#94a3b8'; ctx.font = '600 30px "Noto Sans TC", sans-serif';
    ctx.fillText('全程參與 116 年國立澎湖科技大學「全齡健康體育講座」', 600, 530);
    
    const link = document.createElement('a'); link.download = `研習證書_${name}.jpg`; link.href = canvas.toDataURL('image/jpeg', 1.0); link.click();
}

// ================== 4. Live Q&A 互動邏輯 ==================
function initQASystem() {
    if(!currentQAUser.uid) { showToast("請先完成報到程序", "error"); navigateTo('view-query'); return; }

    const board = document.getElementById('qaMessageBoard');
    const form = document.getElementById('qaForm');

    // 監聽訊息
    onSnapshot(query(collection(db, "qa_messages_2027"), orderBy("timestamp", "asc")), (snapshot) => {
        board.innerHTML = '';
        snapshot.forEach(d => {
            const msg = d.data(); const msgId = d.id;
            const isMe = msg.uid === currentQAUser.uid;
            const isOfficial = msg.author.includes('大會') || msg.author.includes('講師'); // 👑 官方 Badge 邏輯
            const timeStr = msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
            
            const msgDiv = document.createElement('div');
            msgDiv.className = `flex flex-col mb-6 qa-msg ${isMe ? 'items-end' : 'items-start'}`;
            
            let authorBadge = `<span class="text-[10px] text-slate-500 font-bold mb-1 px-1">${sanitize(msg.author)} • ${timeStr}</span>`;
            if (isOfficial) authorBadge = `<span class="text-[10px] text-amber-400 font-black mb-1 px-1 flex items-center gap-1"><span class="bg-amber-500/20 px-2 py-0.5 rounded">👑 官方</span> • ${timeStr}</span>`;

            msgDiv.innerHTML = `
                ${authorBadge}
                <div class="px-5 py-3 rounded-2xl max-w-[85%] ${isMe ? 'bg-cyan-500 text-slate-900 rounded-tr-sm' : isOfficial ? 'bg-amber-500/10 border border-amber-500/30 text-white rounded-tl-sm' : 'bg-white/10 text-white rounded-tl-sm border border-white/5'} shadow-lg relative group">
                    <p class="text-sm leading-relaxed font-medium whitespace-pre-wrap">${sanitize(msg.text)}</p>
                    
                    <button class="like-btn absolute -bottom-3 -right-3 bg-slate-800 border border-slate-600 text-xs px-2 py-1 rounded-full shadow-xl flex items-center gap-1 hover:scale-110 transition-transform ${likedMessages.includes(msgId) ? 'text-pink-500' : 'text-slate-400'}" data-id="${msgId}">
                        <span>❤️</span> <span class="font-black">${msg.likes || 0}</span>
                    </button>
                </div>
            `;
            board.appendChild(msgDiv);
        });
        board.scrollTop = board.scrollHeight;

        // 綁定按讚事件
        document.querySelectorAll('.like-btn').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                if(likedMessages.includes(id)) return; // 簡單防連點
                likedMessages.push(id);
                localStorage.setItem('npu_likes', JSON.stringify(likedMessages));
                btn.classList.replace('text-slate-400', 'text-pink-500');
                await updateDoc(doc(db, "qa_messages_2027", id), { likes: increment(1) });
            };
        });
    });

    // 訊息發送
    form.onsubmit = async (e) => {
        e.preventDefault();
        const input = document.getElementById('qaInput');
        const text = input.value.trim();
        const isAnon = document.getElementById('qaAnonymous').checked;
        if(!text) return;

        input.disabled = true;
        try {
            await addDoc(collection(db, "qa_messages_2027"), {
                uid: currentQAUser.uid, text: text, author: isAnon ? "匿名參與者" : currentQAUser.name, timestamp: serverTimestamp(), likes: 0
            });
            input.value = '';
        } catch(e) { showToast("發送失敗", "error"); }
        finally { input.disabled = false; input.focus(); }
    };
}