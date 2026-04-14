/* ==========================================================================
   ultra.js - EventOS Ultra Pro Advanced Modules 
   [PC-Mobile Pairing Host-Client, Agenda, Q&A, Live Polling, Raffle, Forms, Kiosk (TOTP), Support Chat]
   ========================================================================== */
import { db, currentEventId, sysConfig, currentUserEmail, currentRole, usersData, escapeHTML } from './admin.js';
import { 
    collection, doc, setDoc, addDoc, query, orderBy, updateDoc, 
    onSnapshot, serverTimestamp, where, getDocs, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let unsubsUltra = [];

// ================== SVG 精緻圖示庫 (取代 Emoji 以提升企業質感) ==================
const icons = {
    host: `<svg class="w-4 h-4 text-accent inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>`,
    audience: `<svg class="w-4 h-4 text-slate-500 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>`,
    success: `<svg class="w-24 h-24 text-success mx-auto drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
    warning: `<svg class="w-24 h-24 text-warning mx-auto drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`,
    error: `<svg class="w-24 h-24 text-danger mx-auto drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
    speaker: `<svg class="w-3 h-3 text-accent inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"></path></svg>`
};

// ================== Q&A 互動系統 ==================
window.initQA = function() {
    const qQuery = query(collection(db, `qa_${currentEventId}`), orderBy("createdAt", "desc"));
    
    unsubsUltra.push(
        onSnapshot(qQuery, (snap) => {
            const pList = document.getElementById('qaPendingList'); 
            const lList = document.getElementById('qaLiveList');
            if(!pList || !lList) return;
            
            let pHtml = ''; 
            let lHtml = '';
            
            snap.docs.forEach(d => {
                const q = { id: d.id, ...d.data() };
                
                const repliesHtml = (q.replies || []).map(r => `
                    <div class="mt-3 bg-blue-50/50 p-4 rounded-xl border border-blue-100 text-sm text-slate-700 font-medium ml-4 border-l-4 border-l-accent shadow-sm transition-all hover:shadow-md">
                        <span class="font-black text-accent">${escapeHTML(r.author)}:</span> ${escapeHTML(r.text)}
                    </div>
                `).join('');
                
                const timeString = q.createdAt ? new Date(q.createdAt.toDate()).toLocaleTimeString() : '';
                const roleIcon = q.isHost ? `${icons.host} 主辦單位/講者` : `${icons.audience} 觀眾提問`;
                
                const item = `
                    <div class="bg-white border ${q.isHost ? 'border-accent' : 'border-slate-200'} p-6 rounded-[1.5rem] shadow-sm mb-5 transition-all hover:shadow-lg">
                        <div class="flex justify-between items-center mb-3">
                            <span class="text-sm font-black ${q.isHost ? 'text-accent' : 'text-slate-500'} flex items-center">${roleIcon}</span>
                            <span class="text-[10px] font-bold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 shadow-sm">${timeString}</span>
                        </div>
                        <p class="text-base font-bold text-slate-800 mb-4 leading-relaxed">${escapeHTML(q.text)}</p>
                        ${repliesHtml}
                        <div class="flex flex-wrap gap-3 mt-5 pt-5 border-t border-slate-50">
                            ${q.status === 'pending' ? `<button onclick="window.updateQA('${q.id}', 'live')" class="text-xs bg-success text-white px-5 py-2.5 rounded-xl font-bold shadow-sm hover:bg-emerald-600 transition-colors touch-target hover:-translate-y-0.5">顯示於大螢幕</button>` : ''}
                            ${q.status === 'live' ? `<button onclick="window.updateQA('${q.id}', 'answered')" class="text-xs bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm hover:bg-slate-900 transition-colors touch-target hover:-translate-y-0.5">標記為已解答</button>` : ''}
                            <button onclick="window.replyQA('${q.id}')" class="text-xs bg-blue-50 text-accent border border-blue-100 px-5 py-2.5 rounded-xl font-bold hover:bg-accent hover:text-white transition-colors touch-target hover:-translate-y-0.5">回覆文字</button>
                            <button onclick="window.updateQA('${q.id}', 'rejected')" class="text-xs bg-white text-slate-500 border border-slate-200 px-5 py-2.5 rounded-xl hover:bg-danger hover:text-white hover:border-danger font-bold ml-auto transition-colors touch-target">隱藏問題</button>
                        </div>
                    </div>`;
                
                if (q.status === 'pending') pHtml += item;
                else if (q.status !== 'rejected') lHtml += item;
            });
            
            pList.innerHTML = pHtml || `
                <div class="flex flex-col items-center justify-center py-16 opacity-50">
                    <svg class="w-12 h-12 text-slate-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
                    <p class="text-sm font-bold text-slate-500">尚無待審核問題</p>
                </div>`;
            lList.innerHTML = lHtml || `
                <div class="flex flex-col items-center justify-center py-16 opacity-50">
                    <svg class="w-12 h-12 text-slate-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                    <p class="text-sm font-bold text-slate-500">無展示紀錄</p>
                </div>`;
        })
    );
};

window.updateQA = async (id, status) => { 
    await updateDoc(doc(db, `qa_${currentEventId}`, id), { status }); 
};

window.addHostQuestion = async () => {
    const { value: text } = await Swal.fire({ 
        title: '建立主辦方提問', 
        input: 'textarea', 
        inputPlaceholder: '輸入要展示給觀眾的文字...', 
        confirmButtonText: '發佈至大螢幕',
        confirmButtonColor: '#3b82f6'
    });
    if (text) {
        await addDoc(collection(db, `qa_${currentEventId}`), { 
            text, 
            isHost: true, 
            status: 'live', 
            createdAt: serverTimestamp(), 
            replies: [] 
        });
    }
};

window.replyQA = async (id) => {
    const { value: text } = await Swal.fire({ 
        title: '回覆觀眾問題', 
        input: 'text', 
        inputPlaceholder: '輸入您的回答...', 
        confirmButtonText: '送出回覆',
        confirmButtonColor: '#3b82f6'
    });
    if (!text) return;
    
    const snap = await getDocs(query(collection(db, `qa_${currentEventId}`), where("__name__", "==", id)));
    if (!snap.empty) { 
        const q = snap.docs[0].data(); 
        const replies = q.replies || []; 
        replies.push({ author: currentRole === 'speaker' ? '講者' : '主辦方', text }); 
        await updateDoc(doc(db, `qa_${currentEventId}`, id), { replies }); 
    }
};

// ================== 即時投票系統 (Live Polling) ==================
window.openPollModal = () => { 
    document.getElementById('pollQuestion').value = ''; 
    document.getElementById('pollOptA').value = ''; 
    document.getElementById('pollOptB').value = ''; 
    document.getElementById('pollOptC').value = ''; 
    document.getElementById('pollModal').classList.remove('hidden'); 
    document.getElementById('pollModal').classList.add('flex'); 
};

window.closePollModal = () => { 
    document.getElementById('pollModal').classList.add('hidden'); 
    document.getElementById('pollModal').classList.remove('flex'); 
};

document.getElementById('launchPollBtn')?.addEventListener('click', async () => {
    const question = document.getElementById('pollQuestion').value.trim(); 
    const optA = document.getElementById('pollOptA').value.trim(); 
    const optB = document.getElementById('pollOptB').value.trim(); 
    const optC = document.getElementById('pollOptC').value.trim();
    
    if (!question || !optA || !optB) {
        return Swal.fire('資料不完整', '請至少填寫題目與兩個選項', 'warning');
    }
    
    const options = { [optA]: 0, [optB]: 0 }; 
    if (optC) options[optC] = 0;

    // 關閉先前的投票
    const activePolls = await getDocs(query(collection(db, `polls_${currentEventId}`), where("status", "==", "live")));
    const batch = writeBatch(db); 
    activePolls.docs.forEach(d => batch.update(d.ref, { status: 'closed' })); 
    await batch.commit();

    await addDoc(collection(db, `polls_${currentEventId}`), { 
        question, 
        options, 
        status: 'live', 
        createdAt: serverTimestamp() 
    });
    
    window.closePollModal(); 
    Swal.fire('發佈成功', '投票已同步至大螢幕與用戶端', 'success');
});

// ================== 多廳議程建構器 (Agenda) ==================
window.updateAgendaHallOptions = function() {
    const sel = document.getElementById('agendaTrack'); 
    if (!sel) return;
    const halls = sysConfig.agendaHalls || ['A廳 (Main)', 'B廳'];
    sel.innerHTML = halls.map(h => `<option value="${escapeHTML(h)}">${escapeHTML(h)}</option>`).join('');
};

window.initAgenda = function() {
    window.updateAgendaHallOptions();
    const agendaQuery = query(collection(db, `agenda_${currentEventId}`), orderBy("start", "asc"));
    
    unsubsUltra.push(
        onSnapshot(agendaQuery, (snap) => {
            const container = document.getElementById('agendaTracksContainer'); 
            if (!container) return;
            
            const halls = sysConfig.agendaHalls || ['A廳 (Main)', 'B廳'];
            const tracks = {}; 
            halls.forEach(h => tracks[h] = []); 
            
            snap.docs.forEach(d => { 
                const a = { id: d.id, ...d.data() }; 
                if (tracks[a.track]) tracks[a.track].push(a); 
            });
            
            container.innerHTML = Object.keys(tracks).map(track => {
                const isMainHall = track === halls[0];
                const trackItems = tracks[track].map(a => `
                    <div class="p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-accent hover:shadow-md transition-all group relative">
                        <button onclick="window.delAgenda('${a.id}')" class="absolute top-4 right-4 text-slate-300 hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity touch-target bg-white rounded-full p-1 shadow-sm">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                        <p class="text-xs font-black text-slate-500 mb-2 bg-white inline-block px-3 py-1 rounded-lg shadow-sm border border-slate-100">${a.start}</p>
                        <p class="font-black text-base text-slate-800 leading-snug">${escapeHTML(a.title)}</p>
                        ${a.speaker ? `<p class="text-xs text-accent font-bold mt-3 bg-blue-50/50 inline-block px-3 py-1.5 rounded-lg border border-blue-100">${icons.speaker} ${escapeHTML(a.speaker)}</p>` : ''}
                    </div>
                `).join('');

                return `
                <div class="bg-white p-6 rounded-[1.5rem] border border-slate-200 shadow-sm transition-all hover:shadow-lg">
                    <div class="flex items-center gap-3 border-b border-slate-100 pb-4 mb-5">
                        <div class="w-3 h-3 rounded-full ${isMainHall ? 'bg-accent shadow-[0_0_8px_rgba(37,99,235,0.6)]' : 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]'}"></div>
                        <h3 class="font-black text-xl text-slate-800">${escapeHTML(track)}</h3>
                    </div>
                    <div class="space-y-4">
                        ${tracks[track].length === 0 ? '<p class="text-sm font-bold text-slate-400 text-center py-8">無排程紀錄</p>' : trackItems}
                    </div>
                </div>`;
            }).join('');
        })
    );
};

window.openAgendaModal = () => { 
    document.getElementById('agendaForm').reset(); 
    document.getElementById('agendaId').value = ''; 
    document.getElementById('agendaModal').classList.remove('hidden'); 
    document.getElementById('agendaModal').classList.add('flex'); 
};

window.closeAgendaModal = () => { 
    document.getElementById('agendaModal').classList.add('hidden'); 
    document.getElementById('agendaModal').classList.remove('flex'); 
};

document.getElementById('agendaForm')?.addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    const data = { 
        title: document.getElementById('agendaTitle').value, 
        start: document.getElementById('agendaStart').value, 
        track: document.getElementById('agendaTrack').value, 
        speaker: document.getElementById('agendaSpeaker').value 
    }; 
    await addDoc(collection(db, `agenda_${currentEventId}`), data); 
    window.closeAgendaModal(); 
});

window.delAgenda = async (id) => { 
    const { isConfirmed } = await Swal.fire({title: '確定刪除此議程？', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444'}); 
    if (isConfirmed) {
        await deleteDoc(doc(db, `agenda_${currentEventId}`, id)); 
    }
};

// ================== 講者專屬入口 (Speaker Portal) ==================
window.initSpeakerPortal = async function() {
    if (currentRole !== 'speaker') return;
    const safeEmail = currentUserEmail.replace(/[^a-zA-Z0-9]/g, '_');
    const snap = await getDocs(query(collection(db, `speakers_${currentEventId}`), where("__name__", "==", safeEmail)));
    
    if (!snap.empty) { 
        const data = snap.docs[0].data(); 
        document.getElementById('spkName').value = data.name || ''; 
        document.getElementById('spkBio').value = data.bio || ''; 
        document.getElementById('spkUrl').value = data.deckUrl || ''; 
    }
};

document.getElementById('saveSpeakerBtn')?.addEventListener('click', async () => {
    const safeEmail = currentUserEmail.replace(/[^a-zA-Z0-9]/g, '_');
    const data = { 
        name: document.getElementById('spkName').value, 
        bio: document.getElementById('spkBio').value, 
        deckUrl: document.getElementById('spkUrl').value, 
        updatedAt: serverTimestamp() 
    };
    await setDoc(doc(db, `speakers_${currentEventId}`, safeEmail), data, { merge: true }); 
    Swal.fire('發佈成功', '您的講者簡歷與簡報已同步至大會系統', 'success');
});

// ================== 智能抽獎引擎 (極致順暢動畫版) ==================
window.initRaffle = async function() {
    const snap = await getDocs(query(collection(db, `registrations_${currentEventId}`), where("status", "==", "正取")));
    const allEligible = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const renderWinners = () => {
        const wList = document.getElementById('winnerList'); 
        if (!wList) return;
        
        const winners = allEligible.filter(u => u.isWinner).sort((a,b) => (b.winTime || 0) - (a.winTime || 0));
        wList.innerHTML = winners.map(u => `
            <div class="bg-white p-5 rounded-2xl flex justify-between items-center shadow-sm border border-slate-100 hover:border-accent transition-colors hover:shadow-md group">
                <div class="flex items-center gap-4">
                    <span class="text-accent text-sm font-black bg-blue-50 border border-blue-100 px-4 py-2 rounded-xl shadow-sm">${escapeHTML(u.prizeTier)}</span>
                    <span class="font-black text-slate-800 text-xl">${escapeHTML(u.name)}</span>
                </div>
                <div class="text-xs text-slate-400 font-mono">${new Date(u.winTime).toLocaleTimeString()}</div>
            </div>`).join('') || '<p class="text-sm font-bold text-slate-400 text-center py-8 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">尚未抽出任何獎項</p>';
    };
    renderWinners();

    document.getElementById('startRaffleBtn')?.addEventListener('click', async () => {
        const prize = document.getElementById('rafflePrizeTier').value;
        const pool = allEligible.filter(u => u.checkins && Object.keys(u.checkins).length > 0 && !u.isWinner);
        
        if (pool.length === 0) return Swal.fire('無法抽獎', '現場沒有「已報到且未得獎」的符合資格者', 'error');
        
        const display = document.getElementById('raffleDisplay'); 
        const btn = document.getElementById('startRaffleBtn');
        btn.disabled = true; 
        let c = 0;
        
        const roll = setInterval(() => {
            display.innerText = pool[Math.floor(Math.random() * pool.length)].name; 
            c++;
            if (c > 45) { 
                clearInterval(roll); 
                const winner = pool[Math.floor(Math.random() * pool.length)]; 
                
                display.innerText = winner.name; 
                display.classList.add('scale-125', 'text-yellow-300', 'drop-shadow-[0_0_50px_rgba(253,224,71,1)]');
                
                if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]);
                
                setTimeout(() => display.classList.remove('scale-125', 'text-yellow-300', 'drop-shadow-[0_0_50px_rgba(253,224,71,1)]'), 1200);
                
                updateDoc(doc(db, `registrations_${currentEventId}`, winner.id), { isWinner: true, prizeTier: prize, winTime: Date.now() }); 
                winner.isWinner = true; 
                winner.prizeTier = prize; 
                winner.winTime = Date.now(); 
                
                setTimeout(() => { btn.disabled = false; renderWinners(); }, 1500);
            }
        }, 50);
    });
};

// ================== 表單建構器 ==================
window.initForms = function() {
    const list = document.getElementById('formFieldsList'); 
    if (!list) return;
    
    list.innerHTML = (sysConfig.formFields || []).map((f, i) => `
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-center group hover:border-accent transition-all hover:shadow-md">
            <div>
                <p class="font-black text-slate-800 text-base flex items-center gap-3">${escapeHTML(f.label)} <span class="text-[10px] bg-slate-100 text-slate-500 font-bold px-3 py-1 rounded-lg uppercase tracking-wider border border-slate-200 shadow-sm">${f.type}</span></p>
                ${f.type === 'select' ? `<p class="text-xs font-bold text-slate-500 mt-3 bg-slate-50 inline-block px-3 py-1.5 rounded-lg border border-slate-100">可選項目: ${escapeHTML(f.options.join(', '))}</p>` : ''}
            </div>
            <button onclick="window.delField(${i})" class="text-xs text-danger font-bold opacity-0 group-hover:opacity-100 bg-red-50 hover:bg-danger hover:text-white px-5 py-3 rounded-xl transition-all shadow-sm touch-target">移除欄位</button>
        </div>`).join('') || '<div class="p-12 text-center text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-[2rem] bg-white/50">尚未建立任何自訂收集欄位</div>';
};

window.openFieldModal = () => { 
    document.getElementById('fieldModal').classList.remove('hidden'); 
    document.getElementById('fieldModal').classList.add('flex'); 
    document.getElementById('fieldLabel').value = ''; 
};
window.closeFieldModal = () => { 
    document.getElementById('fieldModal').classList.add('hidden'); 
    document.getElementById('fieldModal').classList.remove('flex'); 
};
document.getElementById('fieldType')?.addEventListener('change', e => {
    document.getElementById('optionsGroup').classList.toggle('hidden', e.target.value !== 'select');
});

document.getElementById('saveFieldBtn')?.addEventListener('click', async () => {
    const label = document.getElementById('fieldLabel').value.trim(); 
    const type = document.getElementById('fieldType').value; 
    const opts = document.getElementById('fieldOptions').value.split(',').filter(Boolean);
    
    if (!label) return Swal.fire('錯誤', '請填寫欄位顯示名稱', 'warning');
    
    if (!sysConfig.formFields) sysConfig.formFields = [];
    sysConfig.formFields.push({ id: 'f_' + Date.now(), label, type, options: opts }); 
    
    await setDoc(doc(db, "settings", `${currentEventId}_config`), sysConfig, { merge: true }); 
    window.closeFieldModal(); 
    window.initForms();
});

window.delField = async (i) => { 
    const { isConfirmed } = await Swal.fire({title: '確定移除此自訂欄位？', text: '已經收集的資料不受影響', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444'}); 
    if (isConfirmed) { 
        sysConfig.formFields.splice(i, 1); 
        await setDoc(doc(db, "settings", `${currentEventId}_config`), sysConfig, { merge: true }); 
        window.initForms(); 
    } 
};

// ================== Kiosk 嚴格模式 (TOTP 真實模擬校驗) ==================
function generateExpectedTOTP(uid) {
    const timeSlice = Math.floor(Date.now() / 30000); // 30秒一個驗證週期
    return btoa(`${uid}_EVENTOS_PRO_${timeSlice}`).substring(0, 6);
}

window.initKiosk = function() {
    document.body.classList.add('kiosk-mode'); 
    document.getElementById('view-kiosk').classList.remove('hidden');
    
    let kioskReader = new Html5Qrcode("kioskReader");
    kioskReader.start(
        { facingMode: "user" }, 
        { fps: 15, qrbox: { width: 350, height: 350 } }, 
        async (text) => { 
            kioskReader.pause(); 
            await handleKioskScan(text, kioskReader); 
        }
    ).catch(e => Swal.fire("相機錯誤", "請允許瀏覽器使用鏡頭權限", "error"));
    
    document.getElementById('exitKioskBtn').onclick = () => { 
        kioskReader.stop(); 
        window.close(); 
    };
};

async function handleKioskScan(rawText, reader) {
    let uid = rawText; 
    let providedTotp = null; 
    if (rawText.includes('_')) { 
        [uid, providedTotp] = rawText.split('_'); 
    }
    
    const snap = await getDocs(query(collection(db, `registrations_${currentEventId}`), where("__name__", "==", uid)));
    
    if (snap.empty) { 
        showKioskResult(icons.error, '無效憑證', '查無此報名紀錄', 'text-danger', ''); 
        return setTimeout(() => reader.resume(), 3000); 
    }
    const u = snap.docs[0].data();

    // 防黃牛 TOTP 嚴格攔截
    if (sysConfig.totpEnabled) {
        const expectedTotp = generateExpectedTOTP(uid);
        if (providedTotp !== expectedTotp) { 
            showKioskResult(icons.warning, '票券已失效', '為防堵黃牛，請勿使用靜態截圖', 'text-warning', '請開啟動態票券頁面重新掃描'); 
            return setTimeout(() => reader.resume(), 4000); 
        }
    }

    if (u.status !== '正取') { 
        showKioskResult(icons.error, '資格不符', u.name, 'text-danger', `狀態：${u.status}`); 
        return setTimeout(() => reader.resume(), 3500); 
    }
    
    const nodeId = sysConfig.checkinNodes[0].id;
    if (u.checkins && u.checkins[nodeId]) { 
        showKioskResult(icons.success, '您已完成入場', u.name, 'text-accent', '請勿重複報到'); 
        return setTimeout(() => reader.resume(), 3000); 
    }

    // 執行報到並播放動畫
    await updateDoc(doc(db, `registrations_${currentEventId}`, uid), { [`checkins.${nodeId}`]: { status: true, time: Date.now(), op: 'KIOSK' } });
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    
    showKioskResult(icons.success, '報到成功', u.name, 'text-success', u.category);
    
    setTimeout(() => { 
        document.getElementById('kioskOverlay').classList.add('hidden'); 
        document.getElementById('kioskOverlay').classList.remove('flex'); 
        reader.resume(); 
    }, 4000);
}

function showKioskResult(iconTxt, title, name, color, tags) { 
    document.getElementById('kioskIcon').innerHTML = iconTxt; 
    document.getElementById('kioskTitle').innerText = title; 
    document.getElementById('kioskName').innerText = name; 
    document.getElementById('kioskName').className = `text-6xl font-black tracking-tight ${color}`; 
    document.getElementById('kioskTags').innerText = tags; 
    
    const overlay = document.getElementById('kioskOverlay'); 
    overlay.classList.remove('hidden'); 
    overlay.classList.add('flex'); 
    overlay.children[0].classList.add('kiosk-success-anim'); 
    
    setTimeout(() => overlay.children[0].classList.remove('kiosk-success-anim'), 500); 
}

// ================== PC-Mobile 配對掃描工作站 (Host-Client) ==================
window.initPairingWorkstation = function() {
    const sessionId = 'WS_' + Math.random().toString(36).substr(2, 6).toUpperCase();
    const pairingUrl = `${window.location.origin}${window.location.pathname}?mode=mobile_client&sid=${sessionId}`;
    
    document.querySelectorAll('.spa-view').forEach(v => v.classList.add('hidden')); 
    document.getElementById('desktop-layout').classList.add('hidden');
    document.body.classList.add('pc-pairing-mode'); 
    
    document.getElementById('view-pc-pairing').classList.remove('hidden'); 
    document.getElementById('view-pc-pairing').classList.add('flex');
    
    new QRious({ element: document.getElementById('pcPairingQR'), value: pairingUrl, size: 300, level: 'H' });
    document.getElementById('pcSessionId').innerText = `Session ID: ${sessionId}`;

    setDoc(doc(db, "workstations", sessionId), { status: 'waiting', createdAt: serverTimestamp() });
    
    unsubsUltra.push(
        onSnapshot(doc(db, "workstations", sessionId), (snap) => { 
            if (snap.exists() && snap.data().status === 'active') { 
                startPCMonitorMode(sessionId); 
            } 
        })
    );
};

function startPCMonitorMode(sid) {
    document.body.classList.replace('pc-pairing-mode', 'pc-monitor-mode'); 
    document.getElementById('view-pc-pairing').classList.add('hidden'); 
    document.getElementById('view-pc-monitor').classList.remove('hidden'); 
    document.getElementById('view-pc-monitor').classList.add('flex');
    
    const feedList = document.getElementById('monitorFeedList'); 
    const cardArea = document.getElementById('monitorCardArea'); 
    let count = 0;
    document.getElementById('monitorNodeName').innerText = sysConfig.checkinNodes[0].name;

    unsubsUltra.push(
        onSnapshot(query(collection(db, `session_events_${currentEventId}`), where("sid", "==", sid), orderBy("time", "desc")), (snap) => {
            snap.docChanges().forEach(change => {
                if (change.type === "added") {
                    const ev = change.doc.data(); 
                    count++; 
                    document.getElementById('monitorCount').innerText = count;
                    
                    // 左側 Feed 紀錄
                    const li = document.createElement('div'); 
                    li.className = 'p-5 bg-white/5 border border-white/10 rounded-[1rem] feed-item-anim flex justify-between items-center shadow-sm';
                    li.innerHTML = `<span class="font-bold text-accent text-lg">${escapeHTML(ev.name)}</span><span class="text-xs text-slate-400 font-mono bg-slate-800 px-2 py-1 rounded">${new Date(ev.time).toLocaleTimeString()}</span>`; 
                    feedList.prepend(li);
                    
                    // 中央卡片閃爍動畫
                    cardArea.innerHTML = `
                        <div class="bg-white p-16 rounded-[3.5rem] shadow-[0_30px_80px_rgba(0,0,0,0.6)] text-center monitor-flash-anim w-[600px] relative overflow-hidden">
                            <div class="absolute -top-16 -right-16 w-48 h-48 bg-accent/10 rounded-full blur-3xl"></div>
                            ${icons.success}
                            <h2 class="text-8xl font-black text-slate-900 mb-6 tracking-tight mt-4">${escapeHTML(ev.name)}</h2>
                            <p class="text-3xl font-bold text-slate-500 uppercase tracking-widest bg-slate-50 px-8 py-4 rounded-[2rem] inline-block border border-slate-100 shadow-inner">${escapeHTML(ev.category)}</p>
                        </div>`;
                        
                    if (navigator.vibrate) navigator.vibrate([100]); 
                }
            });
        })
    );
}

// ================== 手機雷達掃描槍 (Mobile Client) ==================
window.initMobileClientScanner = function() {
    const sid = new URLSearchParams(window.location.search).get('sid'); 
    if (!sid) return Swal.fire('錯誤', '無效的配對連結', 'error');
    
    // 通知 PC 端配對完成
    updateDoc(doc(db, "workstations", sid), { status: 'active' });
    
    document.body.classList.add('mobile-client-mode'); 
    document.getElementById('view-mobile-client').classList.remove('hidden'); 
    document.getElementById('view-mobile-client').classList.add('flex');
    document.getElementById('mobileNodeDisplay').innerText = sysConfig.checkinNodes[0].name;

    let html5QrCode = new Html5Qrcode("mobileReader");
    html5QrCode.start(
        { facingMode: "environment" }, 
        { fps: 15, qrbox: { width: 250, height: 250 } }, 
        async (text) => {
            html5QrCode.pause();
            let uid = text; 
            if(text.includes('_')) uid = text.split('_')[0];
            
            const snap = await getDocs(query(collection(db, `registrations_${currentEventId}`), where("__name__", "==", uid)));
            if (!snap.empty && snap.docs[0].data().status === '正取') {
                const u = snap.docs[0].data();
                
                // 寫入 Session 事件觸發 PC 端大螢幕動畫
                await addDoc(collection(db, `session_events_${currentEventId}`), { sid: sid, name: u.name, category: u.category, time: Date.now() });
                
                if (navigator.vibrate) navigator.vibrate(100);
                const toast = document.getElementById('mobileToast'); 
                toast.innerHTML = `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg> <span>${escapeHTML(u.name)} 報到成功</span>`; 
                toast.classList.remove('opacity-0', '-translate-y-24');
                setTimeout(()=> toast.classList.add('opacity-0', '-translate-y-24'), 2500);
            } else { 
                if (navigator.vibrate) navigator.vibrate([200, 200, 200]); 
            }
            
            // 極速連續掃描模式
            setTimeout(() => html5QrCode.resume(), 600); 
        }
    ).catch(e => Swal.fire("相機錯誤", "請允許鏡頭權限", "error"));

    document.getElementById('closeMobileBtn').onclick = () => { 
        html5QrCode.stop(); 
        window.location.href = window.location.pathname; 
    };
};

window.manualCheckinPrompt = async () => { 
    const { value: q } = await Swal.fire({ title: '手動輸入查詢', input: 'text', inputPlaceholder: '輸入姓名或電話...' }); 
    if (q) Swal.fire('查無此人', '未找到對應的正取紀錄', 'error'); 
};

// ================== 大螢幕 Live Wall (動態彈幕 + 即時投票圖表) ==================
window.initLiveWall = function() {
    document.body.classList.add('wall-mode'); 
    document.getElementById('view-wall').classList.remove('hidden');
    
    // 1. 處理 Q&A 彈幕
    unsubsUltra.push(
        onSnapshot(query(collection(db, `qa_${currentEventId}`), where("status", "==", "live")), (snap) => {
            const container = document.getElementById('wallContainer');
            snap.docChanges().forEach(change => {
                if (change.type === "added") {
                    const el = document.createElement('div'); 
                    el.className = 'wall-message text-4xl md:text-6xl tracking-wide'; 
                    el.innerText = change.doc.data().text;
                    
                    el.style.left = `${Math.random() * 50 + 15}%`; 
                    el.style.animationDuration = `${Math.random() * 15 + 15}s`;
                    
                    container.appendChild(el); 
                    setTimeout(() => el.remove(), 30000); // 動畫結束後回收 DOM
                }
            });
        })
    );
    
    // 2. 處理 Live Polling 長條圖渲染
    unsubsUltra.push(
        onSnapshot(query(collection(db, `polls_${currentEventId}`), where("status", "==", "live")), (snap) => {
            const pollBox = document.getElementById('wallPollContainer');
            if (snap.empty) { 
                pollBox.classList.add('hidden'); 
                return; 
            }
            
            pollBox.classList.remove('hidden');
            const poll = snap.docs[0].data(); 
            document.getElementById('wallPollQuestion').innerText = poll.question;
            
            const optionsObj = poll.options || {}; 
            const totalVotes = Object.values(optionsObj).reduce((a,b)=>a+b, 0) || 1; 
            const colors = ['bg-accent shadow-[0_0_20px_rgba(37,99,235,0.6)]', 'bg-success shadow-[0_0_20px_rgba(16,185,129,0.6)]', 'bg-warning shadow-[0_0_20px_rgba(245,158,11,0.6)]', 'bg-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.6)]'];
            
            document.getElementById('wallPollBars').innerHTML = Object.keys(optionsObj).map((opt, idx) => {
                const votes = optionsObj[opt]; 
                const pct = Math.round((votes / totalVotes) * 100);
                return `
                    <div class="flex flex-col">
                        <div class="flex justify-between text-white font-bold text-3xl mb-4 tracking-wider">
                            <span>${escapeHTML(opt)}</span>
                            <span>${votes} 票 (${pct}%)</span>
                        </div>
                        <div class="w-full bg-slate-800/80 rounded-full h-12 overflow-hidden shadow-inner border border-slate-700 backdrop-blur-md">
                            <div class="poll-bar h-full ${colors[idx % colors.length]} rounded-full" style="width: ${pct}%"></div>
                        </div>
                    </div>`;
            }).join('');
        })
    );
};

// ================== 1對1 工程客服系統 (Support Chat) ==================
let activeChatId = null;

window.initSupportChatWidget = function() {
    document.getElementById('supportWidget').classList.remove('hidden');
    const safeEmail = currentUserEmail.replace(/[^a-zA-Z0-9]/g, '_');
    const chatId = `support_${safeEmail}`;
    
    unsubsUltra.push(
        onSnapshot(doc(db, `support_chats_${currentEventId}`, chatId), (snap) => {
            const box = document.getElementById('widgetMessages');
            if (!snap.exists()) { 
                box.innerHTML = '<p class="text-xs font-bold text-slate-400 text-center mt-10">系統支援服務。請描述您遇到的問題，工程團隊將即時為您處理。</p>'; 
                return; 
            }
            
            const msgs = snap.data().messages || [];
            box.innerHTML = msgs.map(m => `
                <div class="flex flex-col mb-1 ${m.sender === 'user' ? 'items-end' : 'items-start'}">
                    <span class="px-5 py-3 rounded-[1.25rem] text-sm font-bold max-w-[85%] ${m.sender === 'user' ? 'bg-primary text-white rounded-br-sm shadow-md' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm'} leading-relaxed">${escapeHTML(m.text)}</span>
                    <span class="text-[9px] text-slate-400 font-bold mt-1 px-2">${new Date(m.time).toLocaleTimeString()}</span>
                </div>
            `).join('');
            box.scrollTop = box.scrollHeight;
        })
    );

    document.getElementById('widgetSendBtn').onclick = async () => {
        const text = document.getElementById('widgetInput').value.trim(); 
        if (!text) return;
        
        const ref = doc(db, `support_chats_${currentEventId}`, chatId); 
        const snap = await getDocs(query(collection(db, `support_chats_${currentEventId}`), where("__name__", "==", chatId)));
        
        if (snap.empty) {
            await setDoc(ref, { userEmail: currentUserEmail, updatedAt: serverTimestamp(), messages: [{sender: 'user', text, time: Date.now()}] });
        } else {
            await updateDoc(ref, { updatedAt: serverTimestamp(), messages: [...snap.docs[0].data().messages, {sender: 'user', text, time: Date.now()}] });
        }
        document.getElementById('widgetInput').value = '';
    };
};

window.initSupportChatEngineer = function() {
    unsubsUltra.push(
        onSnapshot(query(collection(db, `support_chats_${currentEventId}`), orderBy("updatedAt", "desc")), (snap) => {
            const list = document.getElementById('chatList'); 
            if (!list) return;
            
            list.innerHTML = snap.docs.map(d => {
                const data = d.data(); 
                const msgs = data.messages || []; 
                const last = msgs[msgs.length - 1];
                return `
                    <div onclick="window.openEngChat('${d.id}', '${data.userEmail}')" class="p-6 border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-all ${activeChatId === d.id ? 'bg-blue-50 border-l-4 border-l-accent shadow-inner' : 'border-l-4 border-l-transparent'} group">
                        <p class="font-black text-sm text-slate-800 truncate group-hover:text-accent transition-colors">${escapeHTML(data.userEmail)}</p>
                        <p class="text-xs font-bold text-slate-500 truncate mt-2 bg-white px-3 py-1.5 rounded-lg inline-block border border-slate-100 shadow-sm">${last ? escapeHTML(last.text) : '...'}</p>
                    </div>`;
            }).join('') || '<p class="text-sm font-bold text-slate-400 text-center py-10">目前無客服請求</p>';
        })
    );
};

window.openEngChat = async (id, email) => {
    activeChatId = id; 
    if (email) {
        document.getElementById('activeChatTitle').innerHTML = `<span class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-success shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></span> ${email}</span>`; 
    }
    document.getElementById('chatInputArea').classList.remove('hidden');
    
    if (window.currentChatUnsub) window.currentChatUnsub();
    
    window.currentChatUnsub = onSnapshot(doc(db, `support_chats_${currentEventId}`, id), (snap) => {
        const box = document.getElementById('chatMessages'); 
        if (!snap.exists()) return;
        
        const msgs = snap.data().messages || [];
        box.innerHTML = msgs.map(m => `
            <div class="flex flex-col mb-1 ${m.sender === 'eng' ? 'items-end' : 'items-start'}">
                <span class="px-6 py-3.5 rounded-[1.5rem] text-sm font-bold max-w-[75%] ${m.sender === 'eng' ? 'bg-accent text-white rounded-br-sm shadow-lg' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-md'} leading-relaxed">${escapeHTML(m.text)}</span>
                <span class="text-[10px] text-slate-400 font-bold mt-1 px-2">${new Date(m.time).toLocaleTimeString()}</span>
            </div>
        `).join('');
        box.scrollTop = box.scrollHeight;
    });

    document.getElementById('engSendBtn').onclick = async () => {
        const inputEl = document.getElementById('engChatInput');
        if (!inputEl) return;
        
        const text = inputEl.value.trim(); 
        if (!text) return;
        
        const chatRef = doc(db, `support_chats_${currentEventId}`, activeChatId);
        const snap = await getDocs(query(collection(db, `support_chats_${currentEventId}`), where("__name__", "==", activeChatId)));
        
        if (!snap.empty) {
            const existingMessages = snap.docs[0].data().messages || [];
            await updateDoc(chatRef, { 
                updatedAt: serverTimestamp(), 
                messages: [...existingMessages, { sender: 'eng', text: text, time: Date.now() }] 
            }); 
            inputEl.value = ''; 
        }
    };
};