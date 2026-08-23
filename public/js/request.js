function isValidThaiNationalId(id) {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(id[i], 10) * (13 - i);
  const check = (11 - (sum % 11)) % 10;
  return check === parseInt(id[12], 10);
}

function showAlert(msg, type) {
  const box = document.getElementById('alertBox');
  box.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
}
function clearAlert() {
  document.getElementById('alertBox').innerHTML = '';
}

async function loadEquipment() {
  const res = await fetch('/api/equipment');
  const data = await res.json();
  const sel = document.getElementById('equipment_id');
  data.equipment.forEach((e) => {
    const opt = document.createElement('option');
    opt.value = e.equipment_id;
    const avail = e.available_qty;
    opt.textContent = `${e.name} (เหลือ ${avail} ชิ้น)`;
    if (avail <= 0) {
      opt.textContent += ' — ไม่พร้อมให้ยืม';
      opt.disabled = true;
    }
    sel.appendChild(opt);
  });
}

document.getElementById('national_id').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 13);
});

document.getElementById('reqForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();
  const nid = document.getElementById('national_id').value.trim();
  if (!isValidThaiNationalId(nid)) {
    showAlert('เลขบัตรประชาชนไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง (13 หลัก)', 'error');
    return;
  }
  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังส่งคำขอ...';

  const fd = new FormData();
  fd.append('first_name', document.getElementById('first_name').value.trim());
  fd.append('last_name', document.getElementById('last_name').value.trim());
  fd.append('national_id', nid);
  fd.append('address', document.getElementById('address').value.trim());
  fd.append('equipment_id', document.getElementById('equipment_id').value);
  fd.append('illness_description', document.getElementById('illness_description').value.trim());
  const fileInput = document.getElementById('illness_photo');
  if (fileInput.files[0]) fd.append('illness_photo', fileInput.files[0]);

  try {
    const res = await fetch('/api/requests', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) {
      showAlert(data.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'ส่งคำขอยืม';
      return;
    }
    document.getElementById('reqIdOut').textContent = data.request.request_id;
    document.getElementById('formView').classList.add('hidden');
    document.getElementById('doneView').classList.remove('hidden');
  } catch (err) {
    showAlert('ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'ส่งคำขอยืม';
  }
});

loadEquipment();
