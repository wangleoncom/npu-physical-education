/* ==========================================================================
   admin.js - CMS Pro v6.2 (Bug Fixes: Overlay Shield & Mobile Menu)
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, addDoc, query, orderBy, updateDoc, onSnapshot, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const app = initializeApp({ apiKey: "AIzaSyAsqw3P00oiGHiE8AJTfa6YBx_ynJ2LPiQ", authDomain: "sports-lecture.firebaseapp.com", projectId: "sports-lecture" });
const auth = getAuth(app);
const db = getFirestore(app);

// 全域狀態
let sysConfig = { isOpen: false, categories: [], formFields: [], checkinNodes: [{id: 'default', name: '大會入場'}] };
let usersData = [];
let logsData = [];
let charts = { category: null, status: null };
let currentRole = localStorage.getItem('cmsRole') || 'staff'; 
let currentAdminEmail = '';
let html5QrCode = null;
let currentMode = new URLSearchParams(window.location.search).get('mode');
let torchState = false;

const escapeHTML = (str) => str ? String(str).replace(/[&<>"']/ig, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[m])) : '';

function showToast(msg, type='success') {
    const c = document.getElementById('toastContainer');
    if(!c) return;
    const t = document.createElement('div');
    t.className = `transform transition-all md:translate-x-full -translate-y-full md:translate-y-0 opacity-0 flex items-center gap-3 text-white px-5 py-4 rounded-xl shadow-2xl font-bold text-sm ${type==='error'?'bg-red-500':'bg-slate-900 border border-slate-700'}`;
    t.innerHTML = `<span>${type==='error'?'⚠️':'✨'}</span> <span>${escapeHTML(msg)}</span>`;
    c.appendChild(t);
    requestAnimationFrame(() => t.classList.remove('md:translate-x-full', '-translate-y-full', 'opacity-0'));
    setTimeout(() => { t.classList.add('opacity-0', 'scale-95'); setTimeout(() => t.remove(), 300); }, 3500);
}

function playHaptic(type = 'success') {
    if (!navigator.vibrate) return;
    if (type === 'success') navigator.vibrate([100, 50, 100]);
    if (type === 'error') navigator.vibrate([300, 100, 300]);
}

function playBeep(type = 'success') {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); osc.connect(ctx.destination);
        if (type === 'success') { osc.type = 'sine'; osc.frequency.setValueAtTime(880, ctx.currentTime); osc.start(); osc.stop(ctx.currentTime + 0.1); }
        if (type === 'error') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, ctx.currentTime); osc.start(); osc.stop(ctx.currentTime + 0.3); }
    } catch(e) {}
}

async function writeLog(action, detail) {
    if (currentMode === 'scanner') return; 
    try { await addDoc(collection(db, "logs_2027"), { admin: currentAdminEmail, role: currentRole, action, detail, timestamp: serverTimestamp() }); } catch(e) {}
}

// 💡 確保載入遮罩絕對不會阻擋點擊
const hideLoader = () => {
    const loader = document.getElementById('loader');
    if(loader) {
        loader.style.pointerEvents = 'none'; // 絕對防護：取消所有滑鼠事件
        loader.style.opacity = '0';
        setTimeout(() => loader.classList.add('hidden'), 400);
    }
};

const hideAuth = () => {
    const authSec = document.getElementById('authSection');
    if(authSec) {
        authSec.style.pointerEvents = 'none';
        authSec.style.opacity = '0';
        setTimeout(() => authSec.classList.add('hidden'), 500);
    }
};

// 權限控制
function applyRBAC() {
    const d = document.getElementById('roleDisplay'); if(d) d.innerText = currentRole === 'admin' ? '👑 Super Admin' : '👤 Staff';
    
    document.querySelectorAll('[data-roles]').forEach(el => { 
        const roles = el.getAttribute('data-roles');
        if (roles && !roles.split(',').includes(currentRole)) el.classList.add('hidden'); 
        else el.classList.remove('hidden');
    });
    
    document.querySelectorAll('.admin-only').forEach(el => { 
        if (currentRole !== 'admin') el.classList.add('hidden'); 
        else el.classList.remove('hidden');
    });

    setTimeout(() => {
        const firstAvailableBtn = document.querySelector('.nav-btn:not(.hidden)');
        if (firstAvailableBtn && !firstAvailableBtn.classList.contains('active')) {
            firstAvailableBtn.click();
        }
    }, 50);
}

// --- Auth & Sync ---
onAuthStateChanged(auth, user => {
    const authSec = document.getElementById('authSection');
    if(user) {
        currentAdminEmail = user.email;
        hideAuth();
        applyRBAC(); 
        initSync();
    } else {
        if(currentMode !== 'scanner') { 
            if(authSec) {
                authSec.classList.remove('hidden'); 
                authSec.style.pointerEvents = 'auto'; // 恢復點擊
                setTimeout(() => authSec.style.opacity = '1', 10); 
            }
            hideLoader(); // 確保登入畫面可以被點擊
        } 
        else alert("🔒 安全攔截：請先完成登入。");
    }
});

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const roleSelect = document.getElementById('adminRole').value;
    try { 
        document.getElementById('loginBtn').innerText = "驗證中..."; document.getElementById('loginBtn').disabled = true;
        localStorage.setItem('cmsRole', roleSelect); currentRole = roleSelect;
        await signInWithEmailAndPassword(auth, document.getElementById('adminEmail').value, document.getElementById('adminPwd').value); 
    } catch(e) { showToast("登入失敗", "error"); document.getElementById('loginBtn').innerText = "安全連線"; document.getElementById('loginBtn').disabled = false; }
});

document.getElementById('logoutBtn')?.addEventListener('click', () => { signOut(auth); });

function initSync() {
    hideLoader(); // 確保進入系統後第一時間解除遮罩
    
    onSnapshot(doc(db, "settings", "2027_config"), (snap) => {
        if(snap.exists()) {
            sysConfig = { categories: [], formFields: [], checkinNodes: [{id:'default', name:'大會入場'}], ...snap.data() };
            if(currentMode !== 'scanner') {
                document.getElementById('sysOpenToggle').checked = !!sysConfig.isOpen;
                renderCategories(); renderFormFields(); renderRaffleFilters(); renderNodes(); generatePairingQR();
            }
            updateScannerNodeSelect();
        }
    }, (error) => { console.error("設定檔讀取錯誤", error); });

    onSnapshot(query(collection(db, "registrations_2027"), orderBy("createdAt", "desc")), (snap) => {
        usersData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if(currentMode !== 'scanner') { updateDashboard(); renderUserTable(); renderWinnerList(); }
        else { updateScannerStats(); renderManualSearch(); }
    }, (error) => { console.error("名單讀取錯誤", error); });

    if (currentRole === 'admin') {
        onSnapshot(query(collection(db, "logs_2027"), orderBy("timestamp", "desc")), (snap) => { 
            logsData = snap.docs.map(d => d.data()); 
            renderLogs(); 
        });
    }
}

async function saveConfig() { await setDoc(doc(db, "settings", "2027_config"), sysConfig, { merge: true }); writeLog('SETTINGS_UPDATE', '更新系統參數'); }

/* ==========================================================================
   1. 導覽列路由與手機選單 (Routing & Mobile Menu)
   ========================================================================== */
// 💡 補回被遺漏的手機版選單開關邏輯
const toggleMobileMenu = () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar || !overlay) return;
    
    if (sidebar.classList.contains('-translate-x-full')) {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.remove('opacity-0'), 10);
    } else {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }
};

document.getElementById('mobileMenuBtn')?.addEventListener('click', toggleMobileMenu);
document.getElementById('sidebarOverlay')?.addEventListener('click', toggleMobileMenu);

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active')); e.currentTarget.classList.add('active');
        document.querySelectorAll('.view-section:not(#view-remote-scanner)').forEach(v => v.classList.add('hidden'));
        document.getElementById(`view-${e.currentTarget.dataset.target}`).classList.remove('hidden');
        if (window.innerWidth < 768) { toggleMobileMenu(); } // 點擊後收回選單
    });
});

/* ==========================================================================
   2. 戰情中心 (Dashboard)
   ========================================================================== */
function updateDashboard() {
    const valid = usersData.filter(u => u.status !== '已取消');
    const defaultNodeId = (sysConfig.checkinNodes && sysConfig.checkinNodes.length > 0) ? sysConfig.checkinNodes[0].id : 'default';
    const checked = valid.filter(u => u.checkins && u.checkins[defaultNodeId]);
    
    const statsContainer = document.getElementById('statsContainer');
    if(statsContainer) {
        statsContainer.innerHTML = `
            <div class="pro-card p-4 md:p-5 border-l-4 border-l-slate-400"><p class="text-[10px] md:text-xs text-slate-500 font-bold mb-1">總有效名單</p><p class="text-2xl md:text-3xl font-black">${valid.length}</p></div>
            <div class="pro-card p-4 md:p-5 border-l-4 border-l-emerald-500"><p class="text-[10px] md:text-xs text-slate-500 font-bold mb-1">已入場報到</p><p class="text-2xl md:text-3xl font-black">${checked.length}</p></div>
            <div class="pro-card p-4 md:p-5 border-l-4 border-l-amber-500"><p class="text-[10px] md:text-xs text-slate-500 font-bold mb-1">備取候位</p><p class="text-2xl md:text-3xl font-black">${valid.filter(u=>u.status==='備取').length}</p></div>
            <div class="pro-card p-4 md:p-5 border-l-4 border-l-slate-200"><p class="text-[10px] md:text-xs text-slate-500 font-bold mb-1">取消釋出</p><p class="text-2xl md:text-3xl font-black text-slate-400">${usersData.length - valid.length}</p></div>
        `;
    }

    const c1 = document.getElementById('categoryChart');
    const c2 = document.getElementById('statusChart');
    if(!c1 || !c2) return;

    if(charts.category) charts.category.destroy();
    if(charts.status) charts.status.destroy();

    const catData = {}; valid.forEach(u => catData[u.category] = (catData[u.category]||0)+1);
    charts.category = new Chart(c1.getContext('2d'), { type: 'bar', data: { labels: Object.keys(catData), datasets: [{ data: Object.values(catData), backgroundColor: '#0f172a', borderRadius: 6 }] }, options: { plugins: { legend: { display: false } }, maintainAspectRatio: false } });
    charts.status = new Chart(c2.getContext('2d'), { type: 'doughnut', data: { labels: ['已報到', '未報到'], datasets: [{ data: [checked.length, valid.length - checked.length], backgroundColor: ['#2563eb', '#e2e8f0'], borderWidth: 0 }] }, options: { cutout: '75%', plugins: { legend: { position: 'bottom' } }, maintainAspectRatio: false } });
}

/* ==========================================================================
   3. 名單與 CRM (User Management)
   ========================================================================== */
function renderUserTable() {
    const tbody = document.getElementById('dataTable'); 
    if(!tbody) return;
    const kw = document.getElementById('userSearchInput')?.value.toLowerCase() || '';
    const stat = document.getElementById('filterStatus')?.value || 'all';
    
    tbody.innerHTML = usersData.filter(u => {
        if(stat !== 'all' && u.status !== stat) return false;
        if(kw && !(u.name?.toLowerCase().includes(kw) || u.phone?.includes(kw))) return false;
        return true;
    }).map(u => {
        const nodeBadges = (sysConfig.checkinNodes||[]).map(node => `<span class="px-2 py-0.5 rounded text-[10px] font-bold ${u.checkins && u.checkins[node.id] ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}">${escapeHTML(node.name)}</span>`).join(' ');
        return `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition-colors">
                <td class="px-4 py-3"><input type="checkbox" class="row-cb w-4 h-4 accent-blue-600 admin-only" value="${escapeHTML(u.id)}"></td>
                <td class="px-4 py-3"><span class="px-2 py-1 text-[10px] font-bold rounded ${u.status==='正取'?'bg-emerald-50 text-emerald-600':'bg-slate-100'}">${escapeHTML(u.status)}</span></td>
                <td class="px-4 py-3"><div class="font-bold text-slate-800">${escapeHTML(u.name)}</div><div class="text-[10px] text-slate-500 font-mono">${escapeHTML(u.phone)}</div></td>
                <td class="px-4 py-3 flex gap-1 flex-wrap items-center h-full pt-4">${nodeBadges}</td>
                <td class="px-4 py-3 text-right">
                    <button onclick="openEdit('${escapeHTML(u.id)}')" class="text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 font-bold">編輯</button>
                </td>
            </tr>
        `;
    }).join('');
    applyRBAC();
}

document.getElementById('userSearchInput')?.addEventListener('input', renderUserTable);
document.getElementById('filterStatus')?.addEventListener('change', renderUserTable);

document.getElementById('selectAllCb')?.addEventListener('change', (e) => {
    document.querySelectorAll('.row-cb').forEach(cb => cb.checked = e.target.checked);
});

document.getElementById('applyBatchBtn')?.addEventListener('click', async () => {
    const action = document.getElementById('batchActionSelect').value;
    const selected = Array.from(document.querySelectorAll('.row-cb:checked')).map(cb => cb.value);
    if(!action || selected.length === 0) return showToast("請選擇操作並勾選名單", "error");
    
    if(confirm(`確定要對 ${selected.length} 筆資料執行批次操作？`)) {
        const batch = writeBatch(db);
        selected.forEach(id => {
            const ref = doc(db, "registrations_2027", id);
            if(action === 'approve') batch.update(ref, { status: '正取' });
        });
        await batch.commit();
        document.getElementById('selectAllCb').checked = false;
        writeLog('BATCH_UPDATE', `批次將 ${selected.length} 筆資料轉為正取`);
        showToast("批次更新完成");
    }
});

window.openEdit = (id) => {
    const user = usersData.find(u => u.id === id);
    if(!user) return;
    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUserName').value = user.name || '';
    document.getElementById('editUserPhone').value = user.phone || '';
    document.getElementById('editUserStatus').value = user.status;

    const dfContainer = document.getElementById('editUserDynamicFields');
    dfContainer.innerHTML = (sysConfig.formFields || []).map(f => {
        const val = escapeHTML(user[f.id] || '');
        if(f.type === 'select') {
            return `<div><label class="block text-xs font-bold text-slate-500 mb-1">${escapeHTML(f.label)}</label><select id="df_${f.id}" class="pro-input py-2"><option value="">無</option>${f.options.map(o=>`<option value="${escapeHTML(o)}" ${val===o?'selected':''}>${escapeHTML(o)}</option>`).join('')}</select></div>`;
        }
        return `<div><label class="block text-xs font-bold text-slate-500 mb-1">${escapeHTML(f.label)}</label><input type="text" id="df_${f.id}" class="pro-input py-2" value="${val}"></div>`;
    }).join('');

    document.getElementById('editUserModal').classList.remove('hidden');
    document.getElementById('editUserModal').classList.add('flex');
    setTimeout(()=> document.getElementById('editUserModal').children[0].classList.replace('scale-95', 'scale-100'), 10);
};

document.getElementById('editUserForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editUserId').value;
    const updateData = {
        name: document.getElementById('editUserName').value,
        phone: document.getElementById('editUserPhone').value,
        status: document.getElementById('editUserStatus').value
    };
    
    (sysConfig.formFields || []).forEach(f => {
        const el = document.getElementById(`df_${f.id}`);
        if(el) updateData[f.id] = el.value;
    });

    await updateDoc(doc(db, "registrations_2027", id), updateData);
    document.getElementById('editUserModal').classList.add('hidden');
    document.getElementById('editUserModal').classList.remove('flex');
    document.getElementById('editUserModal').children[0].classList.replace('scale-100', 'scale-95');
    writeLog('USER_UPDATE', `修改了學員資料: ${updateData.name}`);
    showToast("資料已安全更新");
});

/* ==========================================================================
   4. 表單設計器 (Form Builder)
   ========================================================================== */
function renderFormFields() {
    const list = document.getElementById('formFieldsList');
    if(!list) return;
    if(!sysConfig.formFields || sysConfig.formFields.length===0) { list.innerHTML = `<div class="p-10 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-400 font-bold text-sm">目前無自訂欄位</div>`; return; }
    
    list.innerHTML = sysConfig.formFields.map((f, i) => `
        <div class="pro-card p-5 flex justify-between items-center bg-white border-l-4 border-l-slate-800">
            <div><p class="font-bold text-slate-900">${escapeHTML(f.label)} <span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded ml-2">${f.type==='select'?'選單過濾器':'文字輸入'}</span></p>
            ${f.type==='select' ? `<p class="text-xs text-slate-400 mt-2 font-mono">選項: ${escapeHTML(f.options.join(' / '))}</p>` : ''}</div>
            <button onclick="delField(${i})" class="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">刪除</button>
        </div>
    `).join('');
}

document.getElementById('fieldType')?.addEventListener('change', e => {
    document.getElementById('optionsGroup').classList.toggle('hidden', e.target.value !== 'select');
});

document.getElementById('saveFieldBtn')?.addEventListener('click', async () => {
    const label = document.getElementById('fieldLabel').value.trim();
    const type = document.getElementById('fieldType').value;
    const opts = document.getElementById('fieldOptions').value.split(',').map(s=>s.trim()).filter(Boolean);
    if(!label) return showToast("請輸入題目名稱", "error");
    
    sysConfig.formFields.push({ id: 'f_'+Date.now(), label, type, options: type==='select'?opts:[] });
    await saveConfig();
    document.getElementById('fieldModal').classList.add('hidden');
    document.getElementById('fieldModal').classList.remove('flex');
    document.getElementById('fieldLabel').value = '';
    showToast("動態欄位已新增");
});

window.delField = async (i) => { if(confirm("確定刪除此欄位？這會影響前台顯示。")) { sysConfig.formFields.splice(i, 1); await saveConfig(); } };

/* ==========================================================================
   5. 進階抽獎 (Raffle System)
   ========================================================================== */
function renderRaffleFilters() {
    const cBox = document.getElementById('raffleCatExclusion');
    const dBox = document.getElementById('raffleDynamicExclusion');
    if(!cBox || !dBox) return;

    cBox.innerHTML = (sysConfig.categories||[]).map(c => `
        <label class="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100"><input type="checkbox" value="${escapeHTML(c.name)}" class="rf-cat accent-red-500 w-4 h-4 rounded"> 排除 ${escapeHTML(c.name)}</label>
    `).join('');

    const selects = (sysConfig.formFields||[]).filter(f => f.type === 'select');
    if(selects.length === 0) { dBox.innerHTML = '<p class="text-xs text-slate-400 bg-slate-50 p-3 rounded-lg">無可用的選單欄位</p>'; }
    else {
        dBox.innerHTML = selects.map(f => `
            <div class="mb-3 bg-slate-50 p-3 rounded-lg border border-slate-100"><label class="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">限定 ${escapeHTML(f.label)}</label>
            <select class="rf-dyn pro-input py-1.5" data-fid="${escapeHTML(f.id)}"><option value="all">不限</option>${f.options.map(o=>`<option value="${escapeHTML(o)}">${escapeHTML(o)}</option>`).join('')}</select></div>
        `).join('');
    }
}

function renderWinnerList() {
    const list = document.getElementById('winnerList');
    if(!list) return;
    const winners = usersData.filter(u => u.isWinner);
    list.innerHTML = winners.map(u => `<div class="bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-sm font-bold border border-blue-100 flex items-center gap-2 shadow-sm">🏆 ${escapeHTML(u.name)}</div>`).join('');
}

document.getElementById('startRaffleBtn')?.addEventListener('click', async () => {
    const excCats = Array.from(document.querySelectorAll('.rf-cat:checked')).map(cb => cb.value);
    const dynFilters = Array.from(document.querySelectorAll('.rf-dyn')).reduce((acc, sel) => {
        if(sel.value !== 'all') acc[sel.dataset.fid] = sel.value; return acc;
    }, {});

    const pool = usersData.filter(u => {
        const hasCheckin = u.checkins && Object.values(u.checkins).some(v => v === true);
        if(!hasCheckin || u.status==='已取消' || u.isWinner) return false;
        if(excCats.includes(u.category)) return false;
        for(let key in dynFilters) { if(u[key] !== dynFilters[key]) return false; }
        return true;
    });

    if(pool.length === 0) return showToast("無符合條件之名單可供抽選", "error");

    const display = document.getElementById('raffleDisplay');
    const btn = document.getElementById('startRaffleBtn');
    btn.disabled = true; btn.classList.add('opacity-50');
    
    let c = 0;
    const roll = setInterval(() => {
        display.innerText = pool[Math.floor(Math.random()*pool.length)].name;
        c++;
        if(c > 25) {
            clearInterval(roll);
            const winner = pool[Math.floor(Math.random()*pool.length)];
            display.innerText = winner.name;
            updateDoc(doc(db, "registrations_2027", winner.id), { isWinner: true });
            btn.disabled = false; btn.classList.remove('opacity-50');
            display.classList.add('text-emerald-400', 'scale-110');
            setTimeout(()=> display.classList.remove('text-emerald-400', 'scale-110'), 1000);
            writeLog('RAFFLE_WINNER', `抽出中獎者: ${winner.name}`);
        }
    }, 60);
});

/* ==========================================================================
   6. 系統參數與安全匯出 (Settings & Export)
   ========================================================================== */
function renderCategories() {
    const c = document.getElementById('catCardsContainer');
    if(!c) return;
    c.innerHTML = (sysConfig.categories||[]).map((cat, i) => `
        <div class="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-xl">
            <div><span class="font-bold text-sm text-slate-800">${escapeHTML(cat.name)}</span> <span class="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded ml-2 font-bold uppercase tracking-widest">上限 ${cat.limit}</span></div>
            <button onclick="delCat(${i})" class="text-xs text-red-500 font-bold hover:bg-red-50 px-2 py-1 rounded transition-colors">刪除</button>
        </div>
    `).join('');
}

function renderNodes() { 
    const container = document.getElementById('nodesContainer');
    if(!container) return;
    container.innerHTML = (sysConfig.checkinNodes||[]).map((n, i) => `
        <div class="flex justify-between items-center p-2 bg-slate-50 border border-slate-100 rounded">
            <span class="text-sm font-bold">${escapeHTML(n.name)}</span>
            ${i!==0?`<button onclick="delNode(${i})" class="text-xs text-red-500 hover:underline font-bold">刪除</button>`:''}
        </div>
    `).join(''); 
}

document.getElementById('saveSysStatusBtn')?.addEventListener('click', async () => { sysConfig.isOpen = document.getElementById('sysOpenToggle').checked; await saveConfig(); showToast("全域狀態已儲存"); });
document.getElementById('addCatForm')?.addEventListener('submit', async (e) => { e.preventDefault(); sysConfig.categories.push({ name: document.getElementById('catName').value, limit: parseInt(document.getElementById('catLimit').value) }); await saveConfig(); document.getElementById('addCatForm').reset(); showToast("組別已新增"); });
window.delCat = async (i) => { if(confirm("刪除組別？這會影響前台報名選項。")) { sysConfig.categories.splice(i,1); await saveConfig(); } };
document.getElementById('addNodeBtn')?.addEventListener('click', async () => { const n = document.getElementById('newNodeInput').value.trim(); if(n) { sysConfig.checkinNodes.push({ id: 'node_'+Date.now(), name:n }); await saveConfig(); document.getElementById('newNodeInput').value = ''; showToast("節點已新增"); }});
window.delNode = async (i) => { if(confirm("確定刪除此節點？")) { sysConfig.checkinNodes.splice(i, 1); await saveConfig(); showToast("節點已刪除"); } };

function renderLogs() { 
    const container = document.getElementById('logsContainer');
    if(!container) return;
    container.innerHTML = logsData.map(log => {
        const timeStr = log.timestamp ? new Date(log.timestamp.toDate()).toLocaleString() : '';
        return `<div class="p-3 bg-white border border-slate-100 rounded-lg text-sm flex flex-col md:flex-row md:justify-between md:items-center gap-2"><div><span class="font-bold text-slate-800">${escapeHTML(log.action)}</span> <span class="text-slate-500 ml-2">${escapeHTML(log.detail)}</span></div><div class="text-[10px] font-mono text-slate-400 text-right"><span class="px-2 py-0.5 bg-slate-100 rounded mr-2">${escapeHTML(log.admin)}</span>${timeStr}</div></div>`;
    }).join(''); 
}

document.getElementById('exportBtn')?.addEventListener('click', () => {
    document.getElementById('exportAuthModal').classList.remove('hidden');
    document.getElementById('exportAuthModal').classList.add('flex');
});

document.getElementById('confirmExportBtn')?.addEventListener('click', async () => {
    const pwd = document.getElementById('exportPwd').value;
    try {
        await signInWithEmailAndPassword(auth, currentAdminEmail, pwd);
        document.getElementById('exportAuthModal').classList.add('hidden');
        document.getElementById('exportAuthModal').classList.remove('flex');
        document.getElementById('exportPwd').value = '';
        
        const exportData = usersData.map(u => ({ "報名組別":u.category, "姓名":u.name, "電話":u.phone, "電子信箱":u.email, "狀態": u.status }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new(); 
        XLSX.utils.book_append_sheet(wb, ws, "營運名單");
        
        const wsMeta = XLSX.utils.json_to_sheet([{ "匯出者": currentAdminEmail, "時間": new Date().toLocaleString(), "聲明": "機密資料，禁止外流" }]);
        XLSX.utils.book_append_sheet(wb, wsMeta, "Security_Log");
        
        XLSX.writeFile(wb, `NPU_Secure_Export_${Date.now()}.xlsx`);
        writeLog('EXPORT_DATA', '執行了名單加密匯出');
        showToast("資料已安全匯出");
    } catch(e) { showToast("密碼錯誤，拒絕匯出", "error"); }
});

/* ==========================================================================
   7. 🚀 終極版遠端掃描 App Engine (Ultimate Mobile Scanner)
   ========================================================================== */
function generatePairingQR() { const c = document.getElementById('pairingQRCanvas'); if(c) new QRious({ element: c, value: window.location.origin + window.location.pathname + "?mode=scanner", size: 300, level: 'H' }); }

if (currentMode === 'scanner') {
    document.body.classList.add('scanner-mode');
    document.getElementById('view-remote-scanner').classList.remove('hidden');
    document.getElementById('view-remote-scanner').classList.add('flex');

    const updateNetStatus = () => {
        const dot = document.getElementById('netStatusDot'); const txt = document.getElementById('netStatusText');
        if(navigator.onLine) { dot.className = 'w-2 h-2 rounded-full bg-emerald-500'; txt.innerText = 'Online'; txt.classList.replace('text-red-400', 'text-slate-400'); } 
        else { dot.className = 'w-2 h-2 rounded-full bg-red-500 animate-pulse'; txt.innerText = 'Offline Sync'; txt.classList.replace('text-slate-400', 'text-red-400'); }
    };
    window.addEventListener('online', updateNetStatus); window.addEventListener('offline', updateNetStatus);
    updateNetStatus();

    document.querySelectorAll('.app-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.app-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.scanner-tab-content').forEach(c => c.classList.remove('active'));
            const target = e.currentTarget.dataset.target;
            e.currentTarget.classList.add('active');
            document.getElementById(target).classList.add('active');
            
            if(target !== 'tab-scan' && html5QrCode && html5QrCode.isScanning) html5QrCode.pause();
            if(target === 'tab-scan' && html5QrCode && html5QrCode.getState() === 3) html5QrCode.resume();
            if(target === 'tab-stats') updateScannerStats();
        });
    });

    document.getElementById('torchBtn').addEventListener('click', () => {
        if(!html5QrCode || !html5QrCode.isScanning) return showToast("請先啟動相機", "error");
        torchState = !torchState;
        html5QrCode.applyVideoConstraints({ advanced: [{ torch: torchState }] }).then(() => {
            document.getElementById('torchBtn').style.backgroundColor = torchState ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.1)';
        }).catch(e => { showToast("此裝置不支援手電筒", "error"); torchState = false; });
    });

    document.getElementById('startCamBtn').onclick = () => {
        if(!html5QrCode) html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, async (text) => {
            html5QrCode.pause(); processCheckIn(text);
        }).then(() => {
            document.getElementById('startCamBtn').classList.add('hidden');
            document.getElementById('stopCamBtn').classList.remove('hidden');
            document.getElementById('torchBtn').classList.remove('hidden');
        }).catch(e => alert("無法存取相機"));
    };

    document.getElementById('stopCamBtn').onclick = () => {
        if(html5QrCode) html5QrCode.stop().then(() => {
            document.getElementById('startCamBtn').classList.remove('hidden');
            document.getElementById('stopCamBtn').classList.add('hidden');
            document.getElementById('torchBtn').classList.add('hidden'); torchState = false;
        });
    };

    document.getElementById('manualSearchInput').addEventListener('input', renderManualSearch);
    document.getElementById('closeSheetBtn').onclick = closeBottomSheet;
    document.getElementById('sheetOverlay').onclick = closeBottomSheet;
}

window.updateScannerNodeSelect = () => {
    const sel = document.getElementById('scannerNodeSelect');
    if(sel) {
        const val = sel.value;
        sel.innerHTML = (sysConfig.checkinNodes||[]).map(n => `<option value="${escapeHTML(n.id)}">${escapeHTML(n.name)}</option>`).join('');
        if(val) sel.value = val;
        sel.onchange = updateScannerStats;
    }
};

async function processCheckIn(userId) {
    const u = usersData.find(x => x.id === userId);
    const nodeId = document.getElementById('scannerNodeSelect').value;

    if(u) {
        if(u.checkins && u.checkins[nodeId]) {
            playHaptic('error'); playBeep('error');
            openBottomSheet('⚠️ 重複報到', u.name, '此人已完成該節點', 'text-amber-400', '⚠️');
        } else if (u.status !== '正取') {
            playHaptic('error'); playBeep('error');
            openBottomSheet('❌ 資格不符', u.name, `狀態為：${u.status}`, 'text-red-400', '❌');
        } else {
            try { 
                const newCheckins = { ...(u.checkins || {}) }; newCheckins[nodeId] = true;
                await updateDoc(doc(db, "registrations_2027", u.id), { checkins: newCheckins }); 
                
                playHaptic('success'); playBeep('success');
                
                let tagsHtml = `<span class="px-3 py-1 bg-slate-800 rounded-full text-white font-bold text-xs border border-white/10">${escapeHTML(u.category)}</span>`;
                (sysConfig.formFields||[]).forEach(f => {
                    if(u[f.id]) tagsHtml += `<span class="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full font-bold text-xs border border-blue-500/30">${escapeHTML(f.label)}: ${escapeHTML(u[f.id])}</span>`;
                });
                
                openBottomSheet('✅ 核銷成功', u.name, tagsHtml, 'text-emerald-400', '✅');
            } catch(e) { showToast("同步失敗，將於連線後重試", "error"); }
        }
    } else {
        playHaptic('error'); playBeep('error');
        openBottomSheet('❌ 無效憑證', '查無此人', '請確認條碼是否屬於本活動', 'text-red-400', '❓');
    }
}

window.renderManualSearch = () => {
    const kw = document.getElementById('manualSearchInput')?.value.toLowerCase();
    const container = document.getElementById('manualSearchResults');
    if(!container) return;
    
    if(!kw) { container.innerHTML = '<div class="text-center text-slate-500 text-sm mt-10 font-bold">輸入關鍵字尋找報名者</div>'; return; }
    
    const res = usersData.filter(u => u.status === '正取' && ((u.name||'').toLowerCase().includes(kw) || (u.phone||'').includes(kw))).slice(0, 20);
    
    if(res.length === 0) { container.innerHTML = '<div class="text-center text-red-400 text-sm mt-10 font-bold">找不到符合的紀錄</div>'; return; }
    
    const nodeId = document.getElementById('scannerNodeSelect').value;
    
    container.innerHTML = res.map(u => {
        const isChecked = u.checkins && u.checkins[nodeId];
        return `
            <div class="p-4 bg-white/5 border border-white/10 rounded-2xl flex justify-between items-center">
                <div>
                    <p class="font-black text-white text-lg">${escapeHTML(u.name)}</p>
                    <p class="text-xs text-slate-400 font-mono mt-1">${escapeHTML(u.phone)} | ${escapeHTML(u.category)}</p>
                </div>
                ${isChecked 
                    ? `<span class="px-3 py-1.5 bg-slate-800 text-slate-500 rounded-lg text-xs font-bold">已核銷</span>`
                    : `<button onclick="triggerManualCheckIn('${escapeHTML(u.id)}')" class="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold active:scale-95 transition-transform shadow-lg">手動核銷</button>`
                }
            </div>
        `;
    }).join('');
};

window.triggerManualCheckIn = (id) => { processCheckIn(id); };

window.updateScannerStats = () => {
    const nodeId = document.getElementById('scannerNodeSelect')?.value;
    if(!nodeId) return;
    
    const selObj = document.getElementById('scannerNodeSelect');
    if(selObj && selObj.selectedIndex >= 0) {
        document.getElementById('statNodeName').innerText = selObj.options[selObj.selectedIndex].text;
    }
    
    const validUsers = usersData.filter(u => u.status === '正取' || u.status === '備取');
    const total = validUsers.length;
    const checked = validUsers.filter(u => u.checkins && u.checkins[nodeId]).length;
    
    document.getElementById('statTotal').innerText = total;
    document.getElementById('statCurrent').innerText = checked;
    
    const circle = document.getElementById('statProgressCircle');
    if(circle) {
        const percent = total === 0 ? 0 : checked / total;
        const offset = 283 - (283 * percent);
        circle.style.strokeDashoffset = offset;
        circle.style.stroke = percent >= 1 ? '#10b981' : '#38bdf8';
    }
};

function openBottomSheet(title, name, tagsOrSubtitle, titleColorClass, icon) {
    document.getElementById('resultIcon').innerText = icon;
    document.getElementById('resultTitle').className = `text-2xl font-black mb-1 ${titleColorClass}`;
    document.getElementById('resultTitle').innerText = title;
    document.getElementById('resultName').innerText = name;
    document.getElementById('resultTags').innerHTML = typeof tagsOrSubtitle === 'string' && tagsOrSubtitle.includes('<span') ? tagsOrSubtitle : `<p class="text-sm text-slate-400">${tagsOrSubtitle}</p>`;
    
    document.getElementById('sheetOverlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('sheetOverlay').classList.remove('opacity-0'), 10);
    document.getElementById('scanResultSheet').classList.add('open');
}

function closeBottomSheet() {
    document.getElementById('scanResultSheet').classList.remove('open');
    document.getElementById('sheetOverlay').classList.add('opacity-0');
    setTimeout(() => document.getElementById('sheetOverlay').classList.add('hidden'), 300);
    
    if(document.getElementById('tab-scan').classList.contains('active') && html5QrCode) {
        setTimeout(() => { if(html5QrCode.getState() === 3) html5QrCode.resume(); }, 500);
    }
    if(document.getElementById('tab-search').classList.contains('active')) renderManualSearch();
}