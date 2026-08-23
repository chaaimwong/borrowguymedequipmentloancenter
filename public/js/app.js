// ---------- State ----------
let currentUser = null;
let currentTab = 'register';
let equipmentCache = [];

const ICON_PATHS = {
  register: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  borrow: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  requests: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>',
  stock: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  history: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
};
function svgIcon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ''}</svg>`;
}

const TABS = [
  { id: 'register', label: 'ลงทะเบียน' },
  { id: 'borrow', label: 'ยืม-คืน' },
  { id: 'requests', label: 'คำขอ' },
  { id: 'stock', label: 'สต็อก' },
  { id: 'history', label: 'ประวัติ' },
];

// ---------- API helper ----------
async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...opts });
  let data = {};
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    if (res.status === 401) {
      currentUser = null;
      renderShell();
    }
    throw new Error(data.error || `เกิดข้อผิดพลาด (${res.status})`);
  }
  return data;
}
function apiJson(path, method, body) {
  return api(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

function thDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}
function statusBadgeClass(status) {
  if (status === 'คืนแล้ว') return 'badge-returned';
  if (status === 'เกินกำหนด') return 'badge-overdue';
  if (status === 'ยืมอยู่') return 'badge-active';
  if (status === 'รอดำเนินการ') return 'badge-pending';
  if (status === 'อนุมัติ') return 'badge-approved';
  if (status === 'ปฏิเสธ') return 'badge-rejected';
  return '';
}
function isValidThaiNationalId(id) {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(id[i], 10) * (13 - i);
  const check = (11 - (sum % 11)) % 10;
  return check === parseInt(id[12], 10);
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Auth ----------
async function checkSession() {
  const data = await api('/api/auth/me');
  currentUser = data.user;
  renderShell();
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const alertBox = document.getElementById('loginAlert');
  alertBox.innerHTML = '';
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  try {
    const data = await apiJson('/api/auth/login', 'POST', { username, password });
    currentUser = data.user;
    renderShell();
  } catch (err) {
    alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  currentUser = null;
  renderShell();
});

// ---------- Shell / nav ----------
function renderShell() {
  const loginView = document.getElementById('loginView');
  const appShell = document.getElementById('appShell');
  if (!currentUser) {
    loginView.classList.remove('hidden');
    appShell.classList.add('hidden');
    return;
  }
  loginView.classList.add('hidden');
  appShell.classList.remove('hidden');
  document.getElementById('userName').textContent = `${currentUser.name} (${currentUser.role === 'admin' ? 'แอดมิน' : 'เจ้าหน้าที่'})`;
  renderNav();
  switchTab(currentTab);
}

function renderNav() {
  const tabbar = document.getElementById('tabbar');
  const navDesktop = document.getElementById('navDesktop');
  tabbar.innerHTML = '';
  navDesktop.innerHTML = '';
  TABS.forEach((t) => {
    const btn1 = document.createElement('button');
    btn1.innerHTML = `${svgIcon(t.id)}<span>${t.label}</span>`;
    btn1.className = t.id === currentTab ? 'active' : '';
    btn1.onclick = () => switchTab(t.id);
    tabbar.appendChild(btn1);

    const btn2 = document.createElement('button');
    btn2.textContent = t.label;
    btn2.className = t.id === currentTab ? 'active' : '';
    btn2.onclick = () => switchTab(t.id);
    navDesktop.appendChild(btn2);
  });
}

function switchTab(tabId) {
  currentTab = tabId;
  renderNav();
  const map = {
    register: renderRegisterView,
    borrow: renderBorrowView,
    requests: renderRequestsView,
    stock: renderStockView,
    history: renderHistoryView,
  };
  (map[tabId] || renderRegisterView)();
}

function main() { return document.getElementById('mainContainer'); }

// ================= REGISTER VIEW =================
function renderRegisterView() {
  main().innerHTML = `
    <div class="card">
      <h2>ลงทะเบียนผู้ยืมใหม่</h2>
      <p style="color:var(--text-muted); margin-top:-6px;">ต้องแนบรูปบัตรประชาชนเพื่อยืนยันตัวตนก่อนบันทึก</p>
      <div id="regAlert"></div>
      <form id="regForm">
        <div class="row">
          <div class="field"><label>ชื่อ *</label><input type="text" id="r_first_name" required /></div>
          <div class="field"><label>นามสกุล *</label><input type="text" id="r_last_name" required /></div>
        </div>
        <div class="field">
          <label>เลขบัตรประชาชน (13 หลัก) *</label>
          <input type="text" id="r_national_id" inputmode="numeric" maxlength="13" required />
        </div>
        <div class="field"><label>ที่อยู่ *</label><textarea id="r_address" required></textarea></div>
        <div class="field"><label>อธิบายอาการเพิ่มเติม</label><textarea id="r_illness_description"></textarea></div>
        <div class="field">
          <label>ภาพบัตรประชาชน (สำหรับยืนยันตัวตน) *</label>
          <input type="file" id="r_id_card" accept="image/*" capture="environment" required />
        </div>
        <div class="field">
          <label>ภาพอาการป่วย (ถ้ามี)</label>
          <input type="file" id="r_illness_photo" accept="image/*" capture="environment" />
        </div>
        <button type="submit" class="btn btn-primary btn-block">บันทึกการลงทะเบียน</button>
      </form>
    </div>
    <div class="card">
      <div class="section-title"><h3>ค้นหาผู้ยืมที่ลงทะเบียนแล้ว</h3></div>
      <input type="search" id="borrowerSearch" placeholder="ค้นหาด้วยชื่อ หรือเลขบัตรประชาชน" />
      <div id="borrowerSearchResults" style="margin-top:12px;"></div>
    </div>
  `;

  document.getElementById('r_national_id').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 13);
  });

  document.getElementById('regForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertBox = document.getElementById('regAlert');
    alertBox.innerHTML = '';
    const nid = document.getElementById('r_national_id').value.trim();
    if (!isValidThaiNationalId(nid)) {
      alertBox.innerHTML = `<div class="alert alert-error">เลขบัตรประชาชนไม่ถูกต้อง กรุณาตรวจสอบ (13 หลัก)</div>`;
      return;
    }
    const fd = new FormData();
    fd.append('first_name', document.getElementById('r_first_name').value.trim());
    fd.append('last_name', document.getElementById('r_last_name').value.trim());
    fd.append('national_id', nid);
    fd.append('address', document.getElementById('r_address').value.trim());
    fd.append('illness_description', document.getElementById('r_illness_description').value.trim());
    const idCard = document.getElementById('r_id_card').files[0];
    if (idCard) fd.append('id_card_photo', idCard);
    try {
      const data = await api('/api/borrowers', { method: 'POST', body: fd });
      let borrower = data.borrower;
      const illnessPhoto = document.getElementById('r_illness_photo').files[0];
      if (illnessPhoto) {
        const fd2 = new FormData();
        fd2.append('illness_photo', illnessPhoto);
        const data2 = await api(`/api/borrowers/${borrower.borrower_id}/illness-photo`, { method: 'POST', body: fd2 });
        borrower = data2.borrower;
      }
      alertBox.innerHTML = `<div class="alert alert-success">ลงทะเบียนสำเร็จ: ${escapeHtml(borrower.first_name)} ${escapeHtml(borrower.last_name)} (รหัส ${borrower.borrower_id})</div>`;
      e.target.reset();
    } catch (err) {
      alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  });

  let searchTimer;
  document.getElementById('borrowerSearch').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    searchTimer = setTimeout(() => searchBorrowers(q, 'borrowerSearchResults'), 300);
  });
}

async function searchBorrowers(q, targetId) {
  const target = document.getElementById(targetId);
  if (!q) { target.innerHTML = ''; return; }
  try {
    const data = await api(`/api/borrowers?q=${encodeURIComponent(q)}`);
    if (data.borrowers.length === 0) {
      target.innerHTML = `<div class="empty-state">ไม่พบผู้ยืม</div>`;
      return;
    }
    target.innerHTML = data.borrowers.map((b) => `
      <div class="list-item" data-borrower-id="${b.borrower_id}">
        <div class="title">${escapeHtml(b.first_name)} ${escapeHtml(b.last_name)} ${b.verified ? '' : '<span class="badge badge-pending">รอตรวจสอบ</span>'}</div>
        <div class="meta">รหัส ${b.borrower_id} · บัตร ${escapeHtml(b.national_id_masked)}</div>
        <div class="meta">${escapeHtml(b.address)}</div>
      </div>
    `).join('');
    return data.borrowers;
  } catch (err) {
    target.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
}

// ================= BORROW / RETURN VIEW =================
let selectedBorrower = null;

async function renderBorrowView() {
  main().innerHTML = `
    <div class="card">
      <h2>ยืมอุปกรณ์</h2>
      <div class="field">
        <label>ค้นหาผู้ยืม (ชื่อ หรือ เลขบัตรประชาชน)</label>
        <input type="search" id="bwSearch" placeholder="พิมพ์เพื่อค้นหา..." />
      </div>
      <div id="bwResults"></div>
      <div id="bwSelected"></div>
    </div>
    <div class="card">
      <div class="section-title"><h3>รายการที่กำลังยืมอยู่</h3></div>
      <div id="activeLoans">กำลังโหลด...</div>
    </div>
  `;

  let searchTimer;
  document.getElementById('bwSearch').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    searchTimer = setTimeout(async () => {
      const results = await searchBorrowers(q, 'bwResults');
      document.querySelectorAll('#bwResults .list-item').forEach((el) => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
          const id = el.getAttribute('data-borrower-id');
          const b = (results || []).find((x) => x.borrower_id === id);
          selectedBorrower = b;
          renderBorrowerPicked();
          document.getElementById('bwResults').innerHTML = '';
          document.getElementById('bwSearch').value = '';
        });
      });
    }, 300);
  });

  loadActiveLoans();
}

async function loadEquipmentOptions(selectId) {
  const data = await api('/api/equipment');
  equipmentCache = data.equipment;
  const sel = document.getElementById(selectId);
  sel.innerHTML = '<option value="">-- เลือกอุปกรณ์ --</option>' + data.equipment.map((e) =>
    `<option value="${e.equipment_id}" ${e.available_qty <= 0 ? 'disabled' : ''}>${escapeHtml(e.name)} (เหลือ ${e.available_qty})</option>`
  ).join('');
}

async function renderBorrowerPicked() {
  const box = document.getElementById('bwSelected');
  if (!selectedBorrower) { box.innerHTML = ''; return; }
  box.innerHTML = `
    <div class="list-item" style="margin-top:14px;">
      <div class="title">ผู้ยืม: ${escapeHtml(selectedBorrower.first_name)} ${escapeHtml(selectedBorrower.last_name)}</div>
      <div class="meta">รหัส ${selectedBorrower.borrower_id} · บัตร ${escapeHtml(selectedBorrower.national_id_masked)}</div>
      <div class="field" style="margin-top:12px;">
        <label>อุปกรณ์ที่ต้องการยืม</label>
        <select id="bwEquipment"></select>
      </div>
      <div class="field">
        <label>กำหนดคืน (ถ้ามี)</label>
        <input type="date" id="bwDueDate" />
      </div>
      <div id="bwAlert"></div>
      <button class="btn btn-primary btn-block" id="bwSubmit">บันทึกการยืม</button>
    </div>
  `;
  await loadEquipmentOptions('bwEquipment');
  document.getElementById('bwSubmit').addEventListener('click', async () => {
    const alertBox = document.getElementById('bwAlert');
    alertBox.innerHTML = '';
    const equipment_id = document.getElementById('bwEquipment').value;
    const due_date = document.getElementById('bwDueDate').value || null;
    if (!equipment_id) { alertBox.innerHTML = `<div class="alert alert-error">กรุณาเลือกอุปกรณ์</div>`; return; }
    try {
      await apiJson('/api/records', 'POST', { borrower_id: selectedBorrower.borrower_id, equipment_id, due_date });
      alertBox.innerHTML = `<div class="alert alert-success">บันทึกการยืมสำเร็จ</div>`;
      selectedBorrower = null;
      document.getElementById('bwSelected').innerHTML = '';
      loadActiveLoans();
    } catch (err) {
      alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  });
}

async function loadActiveLoans() {
  const target = document.getElementById('activeLoans');
  try {
    const data = await api('/api/records');
    const active = data.records.filter((r) => r.status === 'ยืมอยู่' || r.status === 'เกินกำหนด');
    if (active.length === 0) {
      target.innerHTML = `<div class="empty-state">ไม่มีรายการยืมอยู่ในขณะนี้</div>`;
      return;
    }
    target.innerHTML = active.map((r) => `
      <div class="list-item">
        <div class="title">${escapeHtml(r.equipment_name)} <span class="badge ${statusBadgeClass(r.status)}">${r.status}</span></div>
        <div class="meta">ผู้ยืม: ${escapeHtml(r.borrower_name)}</div>
        <div class="meta">ยืมเมื่อ ${thDate(r.borrow_date)}${r.due_date ? ' · กำหนดคืน ' + new Date(r.due_date).toLocaleDateString('th-TH') : ''}</div>
        <div class="actions">
          <button class="btn btn-secondary btn-sm" data-return="${r.record_id}">บันทึกการคืน</button>
        </div>
      </div>
    `).join('');
    document.querySelectorAll('[data-return]').forEach((btn) => {
      btn.addEventListener('click', () => returnRecord(btn.getAttribute('data-return')));
    });
  } catch (err) {
    target.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
}

async function returnRecord(recordId) {
  const condition = prompt('สภาพอุปกรณ์เมื่อคืน (ไม่บังคับ) เช่น สภาพดี / ชำรุดเล็กน้อย', 'สภาพดี');
  if (condition === null) return; // cancelled
  try {
    await apiJson(`/api/records/${recordId}/return`, 'PUT', { condition_on_return: condition });
    loadActiveLoans();
  } catch (err) {
    alert(err.message);
  }
}

// ================= REQUESTS VIEW =================
let requestsFilter = 'รอดำเนินการ';

function renderRequestsView() {
  main().innerHTML = `
    <div class="card">
      <div class="section-title"><h2 style="margin:0;">คำขอยืมอุปกรณ์</h2></div>
      <div class="row" style="margin-bottom:14px;">
        ${['รอดำเนินการ', 'อนุมัติ', 'ปฏิเสธ', 'ทั้งหมด'].map((s) =>
          `<button class="btn btn-sm ${requestsFilter === s ? 'btn-primary' : 'btn-outline'}" data-filter="${s}">${s}</button>`
        ).join('')}
      </div>
      <div id="reqList">กำลังโหลด...</div>
    </div>
  `;
  document.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => { requestsFilter = btn.getAttribute('data-filter'); renderRequestsView(); });
  });
  loadRequests();
}

async function loadRequests() {
  const target = document.getElementById('reqList');
  try {
    const q = requestsFilter === 'ทั้งหมด' ? '' : `?status=${encodeURIComponent(requestsFilter)}`;
    const data = await api(`/api/requests${q}`);
    if (data.requests.length === 0) {
      target.innerHTML = `<div class="empty-state">ไม่มีคำขอในหมวดนี้</div>`;
      return;
    }
    target.innerHTML = data.requests.map((r) => `
      <div class="list-item">
        <div class="title">${escapeHtml(r.equipment_name)} <span class="badge ${statusBadgeClass(r.status)}">${r.status}</span></div>
        <div class="meta">ผู้ขอ: ${escapeHtml(r.borrower_name)} (${r.borrower_id})</div>
        <div class="meta">ส่งคำขอเมื่อ ${thDate(r.requested_at)}</div>
        ${r.note ? `<div class="meta">หมายเหตุ: ${escapeHtml(r.note)}</div>` : ''}
        ${r.status === 'รอดำเนินการ' ? `
          <div class="actions">
            <button class="btn btn-primary btn-sm" data-approve="${r.request_id}">อนุมัติ</button>
            <button class="btn btn-danger btn-sm" data-reject="${r.request_id}">ปฏิเสธ</button>
          </div>` : ''}
      </div>
    `).join('');
    document.querySelectorAll('[data-approve]').forEach((btn) => {
      btn.addEventListener('click', () => approveRequest(btn.getAttribute('data-approve')));
    });
    document.querySelectorAll('[data-reject]').forEach((btn) => {
      btn.addEventListener('click', () => rejectRequest(btn.getAttribute('data-reject')));
    });
  } catch (err) {
    target.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
}

async function approveRequest(id) {
  const due = prompt('กำหนดวันคืน (YYYY-MM-DD) หรือเว้นว่างถ้าไม่กำหนด', '');
  try {
    await apiJson(`/api/requests/${id}/approve`, 'PUT', { due_date: due || null });
    loadRequests();
  } catch (err) {
    alert(err.message);
  }
}
async function rejectRequest(id) {
  const reason = prompt('เหตุผลที่ปฏิเสธ (ไม่บังคับ)', '');
  if (reason === null) return;
  try {
    await apiJson(`/api/requests/${id}/reject`, 'PUT', { reason });
    loadRequests();
  } catch (err) {
    alert(err.message);
  }
}

// ================= STOCK VIEW =================
function renderStockView() {
  const isAdmin = currentUser.role === 'admin';
  main().innerHTML = `
    <div class="card">
      <div class="section-title"><h2 style="margin:0;">รายการอุปกรณ์ & สต็อก</h2></div>
      <div id="stockList">กำลังโหลด...</div>
    </div>
    ${isAdmin ? `
    <div class="card">
      <h3>เพิ่มอุปกรณ์ใหม่</h3>
      <div id="eqAlert"></div>
      <form id="eqForm">
        <div class="row">
          <div class="field"><label>ชื่ออุปกรณ์ *</label><input type="text" id="eq_name" required /></div>
          <div class="field"><label>หมวดหมู่</label><input type="text" id="eq_category" /></div>
        </div>
        <div class="row">
          <div class="field"><label>จำนวนทั้งหมด *</label><input type="text" inputmode="numeric" id="eq_qty" required /></div>
          <div class="field"><label>แจ้งเตือนเมื่อเหลือ ≤</label><input type="text" inputmode="numeric" id="eq_threshold" value="2" /></div>
        </div>
        <button type="submit" class="btn btn-primary btn-block">เพิ่มอุปกรณ์</button>
      </form>
    </div>` : ''}
  `;
  loadStock(isAdmin);

  if (isAdmin) {
    document.getElementById('eqForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertBox = document.getElementById('eqAlert');
      alertBox.innerHTML = '';
      try {
        await apiJson('/api/equipment', 'POST', {
          name: document.getElementById('eq_name').value.trim(),
          category: document.getElementById('eq_category').value.trim(),
          total_qty: document.getElementById('eq_qty').value.trim(),
          low_stock_threshold: document.getElementById('eq_threshold').value.trim(),
        });
        alertBox.innerHTML = `<div class="alert alert-success">เพิ่มอุปกรณ์สำเร็จ</div>`;
        e.target.reset();
        document.getElementById('eq_threshold').value = 2;
        loadStock(true);
      } catch (err) {
        alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
      }
    });
  }
}

async function loadStock(isAdmin) {
  const target = document.getElementById('stockList');
  try {
    const data = await api('/api/equipment');
    target.innerHTML = data.equipment.map((e) => `
      <div class="list-item">
        <div class="title">${escapeHtml(e.name)} ${e.low_stock ? '<span class="badge badge-low">สต็อกใกล้หมด</span>' : ''}</div>
        <div class="meta">${escapeHtml(e.category || '-')}</div>
        <div class="meta">คงเหลือ ${e.available_qty} / ทั้งหมด ${e.total_qty} (ถูกยืมอยู่ ${e.borrowed_qty})</div>
        <div class="progress-bar-track" style="margin-top:8px;">
          <div class="progress-bar-fill" style="width:${e.total_qty ? (e.available_qty / e.total_qty * 100) : 0}%"></div>
        </div>
        ${isAdmin ? `<div class="actions"><button class="btn btn-outline btn-sm" data-edit-qty="${e.equipment_id}" data-current="${e.total_qty}">แก้ไขจำนวนทั้งหมด</button></div>` : ''}
      </div>
    `).join('');
    if (isAdmin) {
      document.querySelectorAll('[data-edit-qty]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-edit-qty');
          const current = btn.getAttribute('data-current');
          const val = prompt('จำนวนทั้งหมดใหม่', current);
          if (val === null) return;
          try {
            await apiJson(`/api/equipment/${id}`, 'PUT', { total_qty: val });
            loadStock(true);
          } catch (err) {
            alert(err.message);
          }
        });
      });
    }
  } catch (err) {
    target.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
}

// ================= HISTORY VIEW =================
let historySubTab = 'borrower';

function renderHistoryView() {
  main().innerHTML = `
    <div class="card">
      <div class="row" style="margin-bottom:14px;">
        <button class="btn btn-sm ${historySubTab === 'borrower' ? 'btn-primary' : 'btn-outline'}" id="hsBorrower">ประวัติผู้ยืม</button>
        <button class="btn btn-sm ${historySubTab === 'equipment' ? 'btn-primary' : 'btn-outline'}" id="hsEquipment">ประวัติอุปกรณ์</button>
        <button class="btn btn-sm ${historySubTab === 'audit' ? 'btn-primary' : 'btn-outline'}" id="hsAudit">Audit Log</button>
      </div>
      <div id="historyBody"></div>
    </div>
  `;
  document.getElementById('hsBorrower').onclick = () => { historySubTab = 'borrower'; renderHistoryView(); };
  document.getElementById('hsEquipment').onclick = () => { historySubTab = 'equipment'; renderHistoryView(); };
  document.getElementById('hsAudit').onclick = () => { historySubTab = 'audit'; renderHistoryView(); };

  const body = document.getElementById('historyBody');
  if (historySubTab === 'borrower') {
    body.innerHTML = `
      <input type="search" id="hBorrowerSearch" placeholder="ค้นหาผู้ยืมด้วยชื่อหรือเลขบัตรประชาชน" />
      <div id="hBorrowerResults" style="margin-top:12px;"></div>
      <div id="hBorrowerRecords"></div>
    `;
    let t;
    document.getElementById('hBorrowerSearch').addEventListener('input', (e) => {
      clearTimeout(t);
      const q = e.target.value.trim();
      t = setTimeout(async () => {
        const results = await searchBorrowers(q, 'hBorrowerResults');
        document.querySelectorAll('#hBorrowerResults .list-item').forEach((el) => {
          el.style.cursor = 'pointer';
          el.addEventListener('click', () => loadBorrowerHistory(el.getAttribute('data-borrower-id')));
        });
      }, 300);
    });
  } else if (historySubTab === 'equipment') {
    body.innerHTML = `<div id="hEquipmentList">กำลังโหลด...</div><div id="hEquipmentRecords"></div>`;
    loadEquipmentHistoryList();
  } else {
    body.innerHTML = `<div id="hAuditList">กำลังโหลด...</div>`;
    loadAuditLog();
  }
}

async function loadBorrowerHistory(borrowerId) {
  const target = document.getElementById('hBorrowerRecords');
  target.innerHTML = 'กำลังโหลด...';
  try {
    const data = await api(`/api/records?borrower_id=${borrowerId}`);
    if (data.records.length === 0) {
      target.innerHTML = `<div class="empty-state">ผู้ยืมรายนี้ยังไม่มีประวัติการยืม</div>`;
      return;
    }
    const returned = data.records.filter((r) => r.status === 'คืนแล้ว');
    const onTime = returned.filter((r) => !r.due_date || new Date(r.return_date) <= new Date(r.due_date)).length;
    target.innerHTML = `
      <div class="alert alert-success" style="margin-top:14px;">คืนตรงเวลา ${onTime}/${returned.length} ครั้ง จากทั้งหมด ${data.records.length} รายการ</div>
      ${data.records.map((r) => `
        <div class="list-item">
          <div class="title">${escapeHtml(r.equipment_name)} <span class="badge ${statusBadgeClass(r.status)}">${r.status}</span></div>
          <div class="meta">ยืม ${thDate(r.borrow_date)}${r.due_date ? ' · กำหนดคืน ' + new Date(r.due_date).toLocaleDateString('th-TH') : ''}</div>
          ${r.return_date ? `<div class="meta">คืนจริง ${thDate(r.return_date)}${r.condition_on_return ? ' · สภาพ: ' + escapeHtml(r.condition_on_return) : ''}</div>` : ''}
          <div class="meta">ผู้บันทึก: ${escapeHtml(r.handled_by_name || r.handled_by)}${r.received_by_name ? ' / รับคืนโดย ' + escapeHtml(r.received_by_name) : ''}</div>
        </div>
      `).join('')}
    `;
  } catch (err) {
    target.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
}

async function loadEquipmentHistoryList() {
  const target = document.getElementById('hEquipmentList');
  const data = await api('/api/equipment');
  target.innerHTML = data.equipment.map((e) => `
    <div class="list-item" style="cursor:pointer;" data-eq="${e.equipment_id}">
      <div class="title">${escapeHtml(e.name)}</div>
      <div class="meta">คงเหลือ ${e.available_qty} / ${e.total_qty}</div>
    </div>
  `).join('');
  document.querySelectorAll('[data-eq]').forEach((el) => {
    el.addEventListener('click', () => loadEquipmentHistory(el.getAttribute('data-eq')));
  });
}

async function loadEquipmentHistory(equipmentId) {
  const target = document.getElementById('hEquipmentRecords');
  target.innerHTML = 'กำลังโหลด...';
  try {
    const data = await api(`/api/records?equipment_id=${equipmentId}`);
    if (data.records.length === 0) {
      target.innerHTML = `<div class="empty-state">ยังไม่มีประวัติการยืมของอุปกรณ์นี้</div>`;
      return;
    }
    target.innerHTML = data.records.map((r) => `
      <div class="list-item">
        <div class="title">${escapeHtml(r.borrower_name)} <span class="badge ${statusBadgeClass(r.status)}">${r.status}</span></div>
        <div class="meta">ยืม ${thDate(r.borrow_date)}${r.return_date ? ' · คืน ' + thDate(r.return_date) : ''}</div>
      </div>
    `).join('');
  } catch (err) {
    target.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
}

async function loadAuditLog() {
  const target = document.getElementById('hAuditList');
  try {
    const data = await api('/api/audit-log?limit=100');
    if (data.audit_log.length === 0) {
      target.innerHTML = `<div class="empty-state">ยังไม่มีบันทึก</div>`;
      return;
    }
    const actionLabels = {
      login: 'เข้าสู่ระบบ', logout: 'ออกจากระบบ', register_borrower: 'ลงทะเบียนผู้ยืม',
      self_register_borrower: 'ผู้ใช้ลงทะเบียนตนเอง (ผ่านคำขอ)', borrow: 'บันทึกการยืม', return: 'บันทึกการคืน',
      submit_request: 'ส่งคำขอยืม', approve_request: 'อนุมัติคำขอ', reject_request: 'ปฏิเสธคำขอ',
      create_equipment: 'เพิ่มอุปกรณ์', update_equipment: 'แก้ไขอุปกรณ์',
    };
    target.innerHTML = data.audit_log.map((l) => `
      <div class="list-item">
        <div class="title">${actionLabels[l.action] || l.action}</div>
        <div class="meta">โดย ${escapeHtml(l.actor_name)} · ${thDate(l.at)}</div>
        <div class="meta">${escapeHtml(l.target_type)} ${escapeHtml(l.target_id)} ${l.details ? '· ' + escapeHtml(l.details) : ''}</div>
      </div>
    `).join('');
  } catch (err) {
    target.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
}

// ---------- Init ----------
checkSession();
