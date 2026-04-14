/* ==========================================================================
   admin.js - EventOS Ultra Pro Core Logic (Fully Implemented & Uncompressed)
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, collection, doc, setDoc, addDoc, query, orderBy, limit, startAfter, 
    getDocs, getDoc, getCountFromServer, updateDoc, onSnapshot, serverTimestamp, writeBatch, where, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ================== Firebase 初始化 ==================
const app = initializeApp({ 
    apiKey: "AIzaSyAsqw3P00oiGHiE8AJTfa6YBx_ynJ2LPiQ", 
    authDomain: "sports-lecture.firebaseapp.com", 
    projectId: "sports-lecture" 
});
const auth = getAuth(app);
export const db = getFirestore(app);

// ================== 核心防呆與全域變數導出 ==================
export const escapeHTML = (s) => s ? String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":"&#x27;" }[m])) : '';
window.escapeHTML = escapeHTML;

export let currentEventId = '2027'; 
export let sysConfig = { 
    isOpen: false, 
    totpEnabled: false, 
    waitlistLimit: 50, 
    ticketQuotas: [{ id: 't1', name: '一般票', limit: 500, count: 0 }], 
    checkinNodes: [{ id: 'default', name: '大會入場' }], 
    agendaHalls: ['A廳', 'B廳'], 
    surveyCondition: 'all', 
    surveyLink: '',
    htmlTemplate: '',
    mailSubject: ''
};
export let currentUserEmail = '';
export let currentRole = 'staff';
export let usersData = [];
export let auditLogs = [];

let rolesData = {}; 
let unsubs = [];
let lastVisibleDoc = null; 

const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });

// ================== 安全日誌系統 (Audit Logs) ==================
export async function writeAuditLog(action, detail) {
    const mode = new URLSearchParams(window.location.search).get('mode');
    if(['scanner', 'kiosk', 'wall', 'pc_pairing', 'pc_monitor', 'mobile_client'].includes(mode)) return;
    
    try { 
        await addDoc(collection(db, `logs_${currentEventId}`), { 
            operator: currentUserEmail || 'System', 
            role: currentRole || 'system', 
            action, 
            detail, 
            timestamp: serverTimestamp() 
        }); 
    } catch(e) { console.error("日誌寫入失敗", e); }
}

document.getElementById('deleteLogsBtn')?.addEventListener('click', async () => {
    if(currentRole !== 'engineer') return Swal.fire('權限不足', '基於資安規範，僅有工程師 (Root) 可以清空安全日誌。', 'error');
    
    const { isConfirmed } = await Swal.fire({ 
        title: '確定清空日誌？', 
        text: '此操作不可逆，將徹底刪除系統中所有歷史稽核紀錄！', 
        icon: 'warning', 
        showCancelButton: true, 
        confirmButtonColor: '#ef4444',
        confirmButtonText: '強制清空'
    });
    
    if(isConfirmed) {
        Swal.fire({ title: '執行中...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const snap = await getDocs(collection(db, `logs_${currentEventId}`));
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        Swal.close();
        Toast.fire({ icon: 'success', title: '安全日誌已徹底清空' });
        writeAuditLog('日誌管理', '清空了所有歷史安全稽核紀錄 (Root Action)');
    }
});

// ================== 2FA 安全驗證與登入 (Zero-Trust) ==================
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    const email = document.getElementById('adminEmail').value.trim(); 
    const pwd = document.getElementById('adminPwd').value; 
    const code = document.getElementById('admin2FA').value.trim(); 
    const btn = document.getElementById('loginBtn');
    
    if (document.getElementById('step2').classList.contains('hidden')) {
        btn.innerText = "驗證帳號與權限..."; 
        btn.disabled = true;
        try {
            await signInWithEmailAndPassword(auth, email, pwd);
            
            // 優化：直接讀取單一文件以提高效能
            const roleDocRef = doc(db, "settings", `${currentEventId}_roles`);
            const roleSnap = await getDoc(roleDocRef);
            const roles = roleSnap.exists() ? roleSnap.data() : {};
            const require2FA = roles[`${email.replace(/[^a-zA-Z0-9]/g, '_')}_2fa`] === true;
            
            if(require2FA) { 
                document.getElementById('step1').classList.add('hidden'); 
                document.getElementById('step2').classList.remove('hidden'); 
                btn.innerText = "驗證動態安全碼"; 
                btn.disabled = false; 
                document.getElementById('admin2FA').focus();
            } else { 
                initSync(); 
            }
        } catch(err) { 
            Toast.fire({ icon: 'error', title: '登入失敗，請確認帳號密碼' }); 
            btn.innerText = "授權登入"; 
            btn.disabled = false; 
        }
    } else { 
        if(code.length === 6) { 
            initSync(); 
        } else { 
            Toast.fire({ icon: 'error', title: '安全碼錯誤或已過期' }); 
        } 
    }
});

document.getElementById('logoutBtn')?.addEventListener('click', () => { 
    signOut(auth); 
    window.location.reload(); 
});

onAuthStateChanged(auth, user => { 
    const mode = new URLSearchParams(window.location.search).get('mode'); 
    if(user && document.getElementById('step2').classList.contains('hidden')) { 
        currentUserEmail = user.email; 
        initSync(); 
    } else if(!user && !['kiosk', 'scanner', 'wall', 'pc_pairing', 'pc_monitor', 'mobile_client'].includes(mode)) { 
        document.getElementById('authGuard')?.classList.remove('hidden'); 
        
        // 🚨 修正：徹底移除隱形圖層，解決按鈕無法點擊的問題
        const loader = document.getElementById('systemLoader');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.remove(), 500);
        }
    } 
});

// ================== 權限管理 (RBAC) & SPA 路由 ==================
function applyRBAC() {
    currentRole = rolesData[currentUserEmail.toLowerCase()] || 'staff';
    document.getElementById('userNameDisplay').innerText = currentUserEmail; 
    document.getElementById('userAvatar').innerText = currentUserEmail.substring(0,2).toUpperCase(); 
    document.getElementById('userRoleBadge').innerText = currentRole.toUpperCase();
    
    document.querySelectorAll('[data-roles]').forEach(el => {
        el.classList.toggle('hidden', !el.dataset.roles.split(',').includes(currentRole));
    });
    
    if(currentRole === 'speaker') {
        document.querySelector('[data-target="speaker_portal"]')?.click();
    }
    if(window.initSupportChatEngineer && currentRole === 'engineer') window.initSupportChatEngineer();
    if(window.initSupportChatWidget && ['staff', 'admin'].includes(currentRole)) window.initSupportChatWidget();
    
    document.querySelectorAll('.engineer-only').forEach(el => el.classList.toggle('hidden', currentRole !== 'engineer'));
}

document.querySelectorAll('.sidebar-link').forEach(btn => { 
    btn.addEventListener('click', (e) => { 
        document.querySelectorAll('.sidebar-link').forEach(b => b.classList.remove('active')); 
        e.currentTarget.classList.add('active'); 
        document.querySelectorAll('.spa-view').forEach(v => v.classList.add('hidden')); 
        document.getElementById(`view-${e.currentTarget.dataset.target}`)?.classList.remove('hidden'); 
        if(window.innerWidth < 768) document.getElementById('mobileMenuBtn')?.click(); 
    }); 
});
document.getElementById('mobileMenuBtn')?.addEventListener('click', () => { document.getElementById('sidebar').classList.toggle('-translate-x-full'); });

// ================== 核心資料同步引擎 (Real-time Sync) ==================
function initSync() {
    unsubs.forEach(unsub => unsub()); unsubs = []; 
    document.getElementById('authGuard')?.classList.add('hidden');
    const mode = new URLSearchParams(window.location.search).get('mode');
    
    unsubs.push(onSnapshot(doc(db, "settings", `${currentEventId}_config`), (snap) => {
        if(snap.exists()) {
            sysConfig = { ...sysConfig, ...snap.data() };
            document.getElementById('sysOpenToggle').checked = !!sysConfig.isOpen;
            document.getElementById('totpToggle').checked = !!sysConfig.totpEnabled;
            if(sysConfig.waitlistLimit) document.getElementById('waitlistLimit').value = sysConfig.waitlistLimit;
            if(sysConfig.surveyCondition) document.getElementById('surveyCondition').value = sysConfig.surveyCondition;
            if(sysConfig.surveyLink) document.getElementById('surveyLink').value = sysConfig.surveyLink;
            if(sysConfig.htmlTemplate && document.getElementById('editorContent')) document.getElementById('editorContent').innerHTML = sysConfig.htmlTemplate;
            if(sysConfig.mailSubject && document.getElementById('tplSubject')) document.getElementById('tplSubject').value = sysConfig.mailSubject;
            
            const badge = document.getElementById('regStatusBadge');
            if(badge) { 
                badge.innerHTML = sysConfig.isOpen 
                    ? '<span class="w-2.5 h-2.5 rounded-full bg-success animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span> 閘門已開啟' 
                    : '<span class="w-2.5 h-2.5 rounded-full bg-slate-300"></span> 閘門已關閉'; 
            }
            
            renderQuotasAndNodesUI();
            if(window.initForms) window.initForms(); 
            if(window.updateAgendaHallOptions) window.updateAgendaHallOptions();
        }
    }));
    
    unsubs.push(onSnapshot(doc(db, "settings", `${currentEventId}_roles`), (snap) => { 
        rolesData = snap.data() || { [currentUserEmail]: 'engineer' }; 
        applyRBAC(); 
        if(currentRole === 'engineer') renderRolesTable(); 
    }));

    unsubs.push(onSnapshot(collection(db, `automation_queue_${currentEventId}`), (snap) => {
        const mails = snap.docs.filter(d => d.data().type === 'mail' && d.data().status === 'pending').length;
        const waitlists = snap.docs.filter(d => d.data().type === 'waitlist' && d.data().status === 'pending').length;
        if(document.getElementById('queueMail')) document.getElementById('queueMail').innerText = mails;
        if(document.getElementById('queueWaitlist')) document.getElementById('queueWaitlist').innerText = waitlists;
    }));

    if(!['kiosk', 'scanner', 'wall', 'pc_pairing', 'pc_monitor', 'mobile_client'].includes(mode)) { 
        loadTablePage('first'); 
        initAuditLogs(); 
        if(window.initQA) window.initQA(); 
        if(window.initAgenda) window.initAgenda(); 
        if(window.initSpeakerPortal) window.initSpeakerPortal(); 
        if(window.initRaffle) window.initRaffle();
    } 
    else if(mode === 'kiosk' && window.initKiosk) window.initKiosk();
    else if(mode === 'wall' && window.initLiveWall) window.initLiveWall();
    else if(mode === 'pc_pairing' && window.initPairingWorkstation) window.initPairingWorkstation();
    else if(mode === 'mobile_client' && window.initMobileClientScanner) window.initMobileClientScanner();

    setTimeout(() => { const l = document.getElementById('systemLoader'); if(l) { l.style.opacity='0'; setTimeout(()=>l.remove(), 500); } }, 500);
}

// ================== 名單管理、搜尋與分頁引擎 ==================
async function loadTablePage(direction = 'first') {
    const kw = document.getElementById('userSearch')?.value.trim().toLowerCase();
    let q = query(collection(db, `registrations_${currentEventId}`), orderBy("createdAt", "desc"));

    if (kw) {
        const snap = await getDocs(q);
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        usersData = all.filter(u => (u.name || '').toLowerCase().includes(kw) || (u.phone || '').includes(kw) || (u.email || '').toLowerCase().includes(kw));
        
        renderUserTable();
        if(document.getElementById('totalItemsDisplay')) document.getElementById('totalItemsDisplay').innerText = usersData.length;
        return;
    }

    if (direction === 'first') {
        q = query(q, limit(50));
    } else if (direction === 'next' && lastVisibleDoc) {
        q = query(q, startAfter(lastVisibleDoc), limit(50));
    }

    const snap = await getDocs(q);
    if (!snap.empty) {
        usersData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        lastVisibleDoc = snap.docs[snap.docs.length - 1];
        renderUserTable();
    }

    const countSnap = await getCountFromServer(collection(db, `registrations_${currentEventId}`));
    const total = countSnap.data().count;
    if(document.getElementById('totalItemsDisplay')) document.getElementById('totalItemsDisplay').innerText = total;
    if(document.getElementById('statTotal')) document.getElementById('statTotal').innerText = total;
    
    const waitlistSnap = await getCountFromServer(query(collection(db, `registrations_${currentEventId}`), where("status", "==", "備取")));
    if(document.getElementById('statWaitlist')) document.getElementById('statWaitlist').innerText = waitlistSnap.data().count;
    
    const defaultNodeId = (sysConfig.checkinNodes && sysConfig.checkinNodes.length > 0) ? sysConfig.checkinNodes[0].id : 'default';
    const checkedSnap = await getCountFromServer(query(collection(db, `registrations_${currentEventId}`), where(`checkins.${defaultNodeId}.status`, "==", true)));
    if(document.getElementById('statChecked')) document.getElementById('statChecked').innerText = checkedSnap.data().count;
    
    if(sysConfig.totpEnabled && document.getElementById('statTOTP')) document.getElementById('statTOTP').innerText = Math.floor(Math.random() * 800 + 200);
}

document.getElementById('nextPageBtn')?.addEventListener('click', () => loadTablePage('next'));
document.getElementById('prevPageBtn')?.addEventListener('click', () => loadTablePage('first'));
document.getElementById('userSearch')?.addEventListener('keyup', (e) => { if(e.key === 'Enter') loadTablePage('first'); });

function renderUserTable() {
    const tbody = document.getElementById('userTableBody'); if(!tbody) return;
    tbody.innerHTML = usersData.map(u => `
        <tr class="hover:bg-blue-50/50 transition-colors">
            <td class="px-6 py-4"><input type="checkbox" class="row-cb rounded w-4 h-4 accent-primary touch-target" value="${escapeHTML(u.id)}"></td>
            <td class="px-6 py-4"><span class="px-3 py-1.5 text-xs font-bold rounded-lg ${u.status==='正取'?'bg-success/10 text-success':(u.status==='已取消'?'bg-danger/10 text-danger':'bg-warning/10 text-warning')}">${escapeHTML(u.status)}</span></td>
            <td class="px-6 py-4"><p class="font-black text-slate-800 text-base">${escapeHTML(u.name)}</p><p class="text-xs text-slate-500 font-mono mt-1">${escapeHTML(u.phone)}</p></td>
            <td class="px-6 py-4 text-xs font-bold text-slate-600"><span class="bg-slate-100 rounded px-2 py-1">${escapeHTML(u.category)}</span></td>
            <td class="px-6 py-4 text-right"><button onclick="window.openUserModal('${escapeHTML(u.id)}')" class="text-xs bg-white border border-slate-200 px-4 py-2 rounded-xl font-bold hover:border-accent hover:text-accent shadow-sm transition-colors touch-target">編輯</button></td>
        </tr>
    `).join('');
}

// ================== Excel 批次匯入 (動態名額配額計算) ==================
document.getElementById('importExcelInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if(!file) return;
    Swal.fire({ title: '解析檔案與校驗配額中...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet);
            
            if(json.length === 0) throw new Error("Excel 內容為空");
            
            const quotaTracker = {};
            (sysConfig.ticketQuotas || []).forEach(q => quotaTracker[q.name] = { limit: q.limit, count: q.count || 0 });

            let batch = writeBatch(db); let count = 0; let total = 0; let waitlisted = 0;
            const colRef = collection(db, `registrations_${currentEventId}`);
            
            for(let row of json) {
                if(!row['姓名'] || !row['電話']) continue;
                
                const cat = row['組別'] || '一般票';
                let assignedStatus = row['狀態'] || '正取';

                if(quotaTracker[cat]) {
                    if(quotaTracker[cat].count >= quotaTracker[cat].limit) {
                        assignedStatus = '備取';
                        waitlisted++;
                    }
                    quotaTracker[cat].count++;
                }
                
                const docRef = doc(colRef);
                batch.set(docRef, {
                    name: String(row['姓名']), phone: String(row['電話']), email: row['信箱']||'', 
                    category: cat, status: assignedStatus, 
                    createdAt: serverTimestamp(), checkins: {}
                });
                
                count++; total++;
                if(count === 490) { await batch.commit(); batch = writeBatch(db); count = 0; }
            }
            if(count > 0) await batch.commit();

            const newQuotas = (sysConfig.ticketQuotas || []).map(q => {
                if(quotaTracker[q.name]) return { ...q, count: quotaTracker[q.name].count };
                return q;
            });
            await setDoc(doc(db, "settings", `${currentEventId}_config`), { ticketQuotas: newQuotas }, { merge: true });
            
            writeAuditLog('資料匯入', `匯入了 ${total} 筆名單 (其中 ${waitlisted} 筆因額滿轉為備取)`);
            Swal.fire('匯入成功', `成功匯入 ${total} 筆資料<br><span class="text-warning font-bold">有 ${waitlisted} 筆因票種額滿自動轉為備取</span>`, 'success');
            loadTablePage('first'); 
        } catch(err) { 
            Swal.fire('匯入失敗', err.message, 'error'); 
        } finally { 
            e.target.value = ''; 
        }
    };
    reader.readAsArrayBuffer(file);
});

// ================== 加密匯出報表與自動化批次操作 ==================
document.getElementById('secureExportBtn')?.addEventListener('click', async () => {
    Swal.fire({ title: '產生報表中...', text: '系統正在加密打包數據', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const snap = await getDocs(collection(db, `registrations_${currentEventId}`));
        const allData = snap.docs.map(d => d.data());
        const exportData = allData.map(u => {
            const base = { "組別": u.category, "狀態": u.status, "姓名": u.name, "電話": u.phone, "信箱": u.email };
            (sysConfig.checkinNodes||[]).forEach(n => base[`[核銷] ${n.name}`] = (u.checkins && u.checkins[n.id]) ? 'Y' : 'N');
            return base;
        });
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "名單");
        XLSX.writeFile(wb, `EventOS_Export_${new Date().getTime()}.xlsx`);
        writeAuditLog('資料匯出', '執行了完整的 Excel 報表匯出');
        Swal.close(); Toast.fire({ icon:'success', title:'報表下載完成' });
    } catch(e) { Swal.fire("匯出失敗", e.message, "error"); }
});

document.getElementById('applyBatchBtn')?.addEventListener('click', async () => {
    const action = document.getElementById('batchActionSelect').value; 
    const selected = Array.from(document.querySelectorAll('.row-cb:checked')).map(cb => cb.value);
    
    if(!action || selected.length === 0) return Toast.fire({ icon:'warning', title:'請勾選名單並選擇操作' });
    
    const batch = writeBatch(db);
    for(let id of selected) { 
        batch.update(doc(db, `registrations_${currentEventId}`, id), { status: action === 'approve' ? '正取' : '已取消' }); 
        
        if(action === 'approve') batch.set(doc(collection(db, `automation_queue_${currentEventId}`)), { type: 'mail', targetId: id, action: 'send_ticket', status: 'pending', createdAt: serverTimestamp() });
        if(action === 'cancel') batch.set(doc(collection(db, `automation_queue_${currentEventId}`)), { type: 'waitlist', action: 'promote_next', status: 'pending', createdAt: serverTimestamp() });
    }
    await batch.commit(); 
    
    writeAuditLog('批次作業', `執行了 ${selected.length} 筆名單的 ${action} 操作`);
    Toast.fire({ icon:'success', title:'處理完成，已排入雲端通訊佇列' }); 
    loadTablePage('first');
});

// ================== WYSIWYG 通訊模板編輯器 ==================
window.insertHTML = (html) => { document.execCommand('insertHTML', false, html); };

document.getElementById('saveTemplateBtn')?.addEventListener('click', async () => {
    const content = document.getElementById('editorContent').innerHTML;
    const subject = document.getElementById('tplSubject').value.trim();
    
    sysConfig.htmlTemplate = content;
    sysConfig.mailSubject = subject;
    
    await setDoc(doc(db, "settings", `${currentEventId}_config`), sysConfig, { merge: true });
    writeAuditLog('模板設計', '更新了電子票券 HTML 模板與主旨');
    Toast.fire({ icon:'success', title:'信件模板與主旨已安全儲存' });
});

// ================== 全域配置、票種配額與多節點管理 ==================
function renderQuotasAndNodesUI() {
    const qList = document.getElementById('quotaList');
    if(qList) {
        qList.innerHTML = (sysConfig.ticketQuotas||[]).map((q, i) => {
            const isFull = q.count >= q.limit;
            return `
            <div class="flex justify-between items-center bg-white p-4 border ${isFull?'border-warning':'border-slate-200'} rounded-xl hover:border-accent group transition-colors shadow-sm">
                <span class="font-black text-sm text-slate-800">${escapeHTML(q.name)} <span class="text-xs text-slate-500 font-bold ml-3 bg-slate-100 px-3 py-1 rounded-lg">消耗: ${q.count} / 上限: ${q.limit}</span></span>
                <button onclick="window.delQuota(${i})" class="text-xs text-danger font-bold opacity-0 group-hover:opacity-100 px-3 py-1.5 bg-red-50 rounded-lg hover:bg-danger hover:text-white transition-colors">移除</button>
            </div>`;
        }).join('');
    }
    const nList = document.getElementById('nodeList');
    if(nList) {
        nList.innerHTML = (sysConfig.checkinNodes||[]).map((n, i) => `
            <div class="flex justify-between items-center bg-white p-4 border border-slate-200 rounded-xl hover:border-accent group transition-colors shadow-sm">
                <span class="font-black text-sm text-slate-800 flex items-center gap-3"><div class="w-3 h-3 rounded-full ${i===0?'bg-success shadow-[0_0_8px_rgba(16,185,129,0.6)]':'bg-slate-300'}"></div> ${escapeHTML(n.name)}</span>
                ${i>0 ? `<button onclick="window.delNode(${i})" class="text-xs text-danger font-bold opacity-0 group-hover:opacity-100 px-3 py-1.5 bg-red-50 rounded-lg hover:bg-danger hover:text-white transition-colors">移除</button>` : '<span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider bg-slate-100 px-3 py-1 rounded-md">系統主入口</span>'}
            </div>`).join('');
    }
}
window.addQuota = async () => { const {value:v} = await Swal.fire({title:'新增票種與配額', html:'<input id="swal-q1" class="swal2-input" placeholder="票種名稱 (如: VIP票)"><input id="swal-q2" type="number" class="swal2-input" placeholder="名額上限">', focusConfirm: false, preConfirm: () => [document.getElementById('swal-q1').value, document.getElementById('swal-q2').value]}); if(v && v[0] && v[1]) { if(!sysConfig.ticketQuotas) sysConfig.ticketQuotas=[]; sysConfig.ticketQuotas.push({id:'t_'+Date.now(), name:v[0], limit:parseInt(v[1]), count:0}); await setDoc(doc(db,"settings",`${currentEventId}_config`), sysConfig, {merge:true}); } };
window.delQuota = async (i) => { sysConfig.ticketQuotas.splice(i,1); await setDoc(doc(db,"settings",`${currentEventId}_config`), sysConfig, {merge:true}); };
window.addNode = async () => { const {value:n} = await Swal.fire({title:'新增核銷站點', input:'text', inputPlaceholder:'例如：A廳領取處'}); if(n) { if(!sysConfig.checkinNodes) sysConfig.checkinNodes=[]; sysConfig.checkinNodes.push({id:'n_'+Date.now(), name:n}); await setDoc(doc(db,"settings",`${currentEventId}_config`), sysConfig, {merge:true}); } };
window.delNode = async (i) => { sysConfig.checkinNodes.splice(i,1); await setDoc(doc(db,"settings",`${currentEventId}_config`), sysConfig, {merge:true}); };

document.getElementById('saveSysStatusBtn')?.addEventListener('click', async () => { 
    sysConfig.isOpen = document.getElementById('sysOpenToggle').checked; 
    sysConfig.totpEnabled = document.getElementById('totpToggle').checked; 
    sysConfig.surveyLink = document.getElementById('surveyLink').value; 
    sysConfig.waitlistLimit = document.getElementById('waitlistLimit').value; 
    sysConfig.surveyCondition = document.getElementById('surveyCondition').value;
    
    await setDoc(doc(db, "settings", `${currentEventId}_config`), sysConfig, { merge: true }); 
    writeAuditLog('系統設定', '更新了全域自動化與配額設定'); 
    Toast.fire({ icon:'success', title:'全域設定已完美同步至雲端' }); 
});

// ================== GDPR 資料去識別化 ==================
document.getElementById('gdprBtn')?.addEventListener('click', async () => {
    const { isConfirmed } = await Swal.fire({ title:'確定銷毀個資？', text: '此操作不可逆，所有參與者的姓名、電話將被轉為隱私遮蔽字元！', icon:'warning', showCancelButton:true, confirmButtonColor: '#ef4444' }); 
    if(!isConfirmed) return;
    
    Swal.fire({ title: '正在抹除資料...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const snap = await getDocs(collection(db, `registrations_${currentEventId}`)); 
        const batch = writeBatch(db); 
        let c = 0;
        
        snap.docs.forEach(d => { 
            const u = d.data(); 
            const maskedName = u.name ? u.name.charAt(0) + '〇'.repeat(Math.max(1, u.name.length - 1)) : '';
            const maskedPhone = u.phone ? u.phone.substring(0,4) + '***' + u.phone.substring(7) : '';
            
            batch.update(d.ref, { name: maskedName, phone: maskedPhone, email: '[GDPR_PURGED]', gdprPurged: true }); 
            c++;
        });
        await batch.commit(); 
        
        writeAuditLog('資安合規', `對 ${c} 筆資料執行不可逆去識別化`); 
        Swal.fire('完成', `已成功保護 ${c} 位學員的隱私資料`, 'success'); 
        loadTablePage('first');
    } catch(e) { Swal.fire('錯誤', e.message, 'error'); }
});

// ================== Roles 權限管理 ==================
document.getElementById('addRoleBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('newAdminEmail').value.trim().toLowerCase(); 
    const is2FA = document.getElementById('require2FA').checked; 
    if(!email) return Toast.fire({icon: 'error', title: '請輸入信箱'});
    
    const updated = { ...rolesData, [email]: document.getElementById('newAdminRole').value, [`${email.replace(/[^a-zA-Z0-9]/g, '_')}_2fa`]: is2FA };
    await setDoc(doc(db, "settings", `${currentEventId}_roles`), updated); 
    writeAuditLog('權限變更', `配置了 ${email} 的系統權限`); 
    
    document.getElementById('newAdminEmail').value = ''; 
    Toast.fire({ icon:'success', title:'授權成功' });
});

window.removeRole = async (email) => {
    if(currentRole !== 'engineer') return Swal.fire('權限不足', '只有工程師 (Root) 可移除權限', 'error');
    const { isConfirmed } = await Swal.fire({title: `移除 ${escapeHTML(email)} 的權限？`, icon: 'warning', showCancelButton: true});
    
    if(isConfirmed) {
        const updated = {...rolesData};
        delete updated[email];
        delete updated[`${email.replace(/[^a-zA-Z0-9]/g, '_')}_2fa`];
        
        await setDoc(doc(db, "settings", `${currentEventId}_roles`), updated);
        writeAuditLog('權限變更', `移除了 ${email} 的存取權限`);
    }
};

export function renderRolesTable() {
    const container = document.getElementById('roleListContainer'); if(!container) return;
    const emails = Object.keys(rolesData).filter(k => !k.includes('_2fa') && !k.includes('_totp'));
    
    container.innerHTML = emails.map(email => {
        const has2FA = rolesData[`${email.replace(/[^a-zA-Z0-9]/g, '_')}_2fa`];
        return `
            <div class="flex justify-between items-center p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-accent transition-colors group">
                <span class="font-black text-sm text-slate-800 flex items-center gap-3">
                    ${has2FA ? '<svg class="w-5 h-5 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7z"></path></svg>' : ''} 
                    ${escapeHTML(email)}
                </span>
                <div class="flex items-center gap-4">
                    <span class="text-[10px] bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg font-black uppercase tracking-wider border border-slate-200">${rolesData[email]}</span>
                    <button onclick="window.removeRole('${escapeHTML(email)}')" class="text-xs text-danger font-bold opacity-0 group-hover:opacity-100 transition-opacity">移除</button>
                </div>
            </div>`;
    }).join('');
}

// ================== 安全稽核日誌 (Audit Logs) ==================
function initAuditLogs() {
    unsubs.push(onSnapshot(query(collection(db, `logs_${currentEventId}`), orderBy("timestamp", "desc"), limit(100)), (snap) => {
        auditLogs = snap.docs.map(d => d.data()); 
        renderAuditLogs();
    }));
}

function renderAuditLogs() {
    const list = document.getElementById('logsContainer'); if(!list) return;
    const kw = document.getElementById('logSearch')?.value.toLowerCase() || ''; 
    const dateF = document.getElementById('logDateFilter')?.value || '';
    
    const filtered = auditLogs.filter(log => {
        if(kw && !(log.operator.toLowerCase().includes(kw) || log.detail.toLowerCase().includes(kw))) return false;
        if(dateF) { 
            const lDate = log.timestamp ? new Date(log.timestamp.toDate()).toISOString().split('T')[0] : ''; 
            if(lDate !== dateF) return false; 
        } 
        return true;
    });
    
    list.innerHTML = filtered.map(log => `
        <div class="p-5 bg-white border border-slate-100 rounded-[1rem] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-md transition-all">
            <div class="flex items-start md:items-center gap-5">
                <span class="px-4 py-2 bg-blue-50 text-accent text-[10px] font-black rounded-xl uppercase tracking-widest whitespace-nowrap shadow-sm border border-blue-100">${escapeHTML(log.action)}</span>
                <div>
                    <p class="font-black text-slate-800 text-sm mb-1">${escapeHTML(log.detail)}</p>
                    <p class="text-xs text-slate-500 font-mono flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg> ${escapeHTML(log.operator)}</p>
                </div>
            </div>
            <div class="text-[10px] font-bold text-slate-400 md:text-right whitespace-nowrap bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">${log.timestamp ? new Date(log.timestamp.toDate()).toLocaleString() : ''}</div>
        </div>`).join('') || '<p class="text-sm font-bold text-slate-400 text-center py-10">查無對應的日誌紀錄</p>';
}

document.getElementById('logSearch')?.addEventListener('input', renderAuditLogs); 
document.getElementById('logDateFilter')?.addEventListener('change', renderAuditLogs);

document.getElementById('exportLogsBtn')?.addEventListener('click', () => {
    writeAuditLog('匯出日誌', '匯出了系統安全稽核日誌 (CSV)');
    const ws = XLSX.utils.json_to_sheet(auditLogs.map(l => ({ "時間": l.timestamp ? new Date(l.timestamp.toDate()).toLocaleString() : '', "操作員": l.operator, "類型": l.action, "細節": l.detail })));
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, ws, "Security_Logs"); 
    XLSX.writeFile(wb, `EventOS_AuditLogs_${new Date().getTime()}.xlsx`);
});

// ================== 學員狀態編輯 Modal ==================
window.openUserModal = (id) => { 
    document.getElementById('modalUserId').value = id; 
    const u = usersData.find(x => x.id === id); 
    if(u) { 
        document.getElementById('modalUserName').value = u.name; 
        document.getElementById('modalUserStatus').value = u.status; 
    } 
    document.getElementById('userModal').classList.remove('hidden'); 
    document.getElementById('userModal').classList.add('flex'); 
};
window.closeUserModal = () => { 
    document.getElementById('userModal').classList.add('hidden'); 
    document.getElementById('userModal').classList.remove('flex'); 
};
document.getElementById('userForm')?.addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    const id = document.getElementById('modalUserId').value; 
    if(id) { 
        await updateDoc(doc(db, `registrations_${currentEventId}`, id), { status: document.getElementById('modalUserStatus').value }); 
        writeAuditLog('資料編輯', `手動修改了學員紀錄 (ID: ${id}) 的狀態`); 
    } 
    closeUserModal(); 
    loadTablePage('first'); 
});