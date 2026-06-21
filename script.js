// ⚙️ Dán URL Web App của bạn tại đây
const API_URL = "https://script.google.com/macros/s/AKfycby-R1_sC4CCX2Id-zA4yrgRnkI8gMol2Kgl3b3CeDL-YrQq_8zQAq78O5I2RLrPwRD1/exec";

let buffer = []; // lưu tạm các mã chưa gửi
let isSyncing = false; // trạng thái đang đồng bộ
let scannedCodes = new Set(); // lưu trữ mã đã quét trong phiên để kiểm tra trùng lặp

// Khôi phục mã đã quét từ localStorage để chống trùng ngay cả khi tải lại trang
try {
  const saved = JSON.parse(localStorage.getItem("scannedCodes"));
  if (Array.isArray(saved)) {
    scannedCodes = new Set(saved);
  }
} catch (e) {}

// Cập nhật giao diện: hiển thị các mã lạ
function updateUnusualCodesDisplay(code) {
  const area = document.getElementById("unusualCodes");
  if (!area) return;
  const upper = code.toUpperCase();
  if (!upper.startsWith("FRK") && !upper.startsWith("TR80001")) {
    area.value = area.value ? area.value + "\n" + code : code;
    area.scrollTop = area.scrollHeight;
  }
}

function updateCurrentSheet() {
  fetch(`${API_URL}?action=getCurrentSheet`)
    .then((res) => res.text())
    .then(
      (name) => (document.getElementById("currentSheet").textContent = name)
    );
}

// ✅ Thêm mã vào bộ nhớ tạm
function getSoKien(maDon) {
  let cleanCode = maDon.trim();
  if (cleanCode.toUpperCase().startsWith("FRK")) {
    cleanCode = cleanCode.substring(3);
  }
  const match = cleanCode.match(/F(\d+)/i);
  if (match) {
    return match[1];
  }
  return "1";
}

function toggleReasonSelect() {
  const checkbox = document.getElementById("useReason");
  const select = document.getElementById("reasonSelect");
  if (!checkbox || !select) return;
  select.disabled = !checkbox.checked;
  if (checkbox.checked) {
    select.style.cursor = "pointer";
    select.style.backgroundColor = "#fff";
    select.style.borderColor = "var(--primary)";
  } else {
    select.style.cursor = "not-allowed";
    select.style.backgroundColor = "#f8fafc";
    select.style.borderColor = "var(--border-color)";
  }
}

function saveMaDon() {
  const input = document.getElementById("maDon");
  if (!input) return;
  const maDon = input.value.trim();
  if (!maDon) return;

  // Lọc trùng: Kiểm tra xem mã đã được quét chưa (trong phiên hoặc trong buffer chờ gửi)
  const isDuplicate = Array.from(scannedCodes).some(c => String(c).trim() === String(maDon).trim()) || 
                      buffer.some(item => String(item.code).trim() === String(maDon).trim());
  if (isDuplicate) {
    document.getElementById("message").textContent = `❌ Trùng lặp: Mã "${maDon}" đã được quét! Không lưu.`;
    input.value = "";
    input.focus();
    return;
  }

  // ==== Tìm kiếm / Tra cứu mã ====
  const targetArea = document.getElementById("targetsInput");
  let isTargetFound = false;
  if (targetArea && targetArea.value.trim() !== "") {
    let lines = targetArea.value.split('\n');
    let matched = false;
    for (let i = 0; i < lines.length; i++) {
      let cleanLine = lines[i].replace(/✅/g, '').trim();
      if (cleanLine === maDon) {
        lines[i] = cleanLine + " ✅";
        matched = true;
        isTargetFound = true;
      }
    }
    if (matched) {
      targetArea.value = lines.join('\n');
      targetArea.dispatchEvent(new Event('input')); // Update display count
    }
  }

  // Thêm vào danh sách đã quét và lưu cục bộ
  scannedCodes.add(maDon);
  localStorage.setItem("scannedCodes", JSON.stringify([...scannedCodes]));

  // Cảnh báo nếu mã định dạng lạ
  updateUnusualCodesDisplay(maDon);

  // Get reason and quantity
  const useReason = document.getElementById("useReason") ? document.getElementById("useReason").checked : false;
  const reasonVal = useReason ? document.getElementById("reasonSelect").value : "";
  const qtyVal = getSoKien(maDon);

  buffer.push({ code: maDon, reason: reasonVal, qty: qtyVal });
  input.value = "";
  input.focus();
  
  if (isTargetFound) {
    document.getElementById("message").textContent = `🎯 TÌM THẤY MÃ TRA CỨU: ${maDon}`;
  } else {
    document.getElementById("message").textContent = `📥 Đã thêm tạm: ${maDon} (${buffer.length} mã chờ lưu)`;
  }
}

// 🔁 Tự động gửi dữ liệu nền mỗi 2 giây
setInterval(async () => {
  if (isSyncing || buffer.length === 0) return;
  isSyncing = true;

  const batch = [...buffer];
  buffer = []; // tạm làm rỗng trước

  try {
    const res = await fetch(`${API_URL}?action=batchSave`, {
      method: "POST",
      body: JSON.stringify(batch),
    });
    const msg = await res.text();
    if (msg.startsWith("❌")) {
      document.getElementById("message").textContent = msg;
    } else {
      document.getElementById("message").textContent = `✅ ${msg}`;
    }
    
    // Refresh table data
    refreshTableData();
  } catch (err) {
    // nếu lỗi, khôi phục buffer
    localStorage.setItem("buffer", JSON.stringify(buffer));
    buffer = [...batch, ...buffer];
    document.getElementById("message").textContent = "⚠️ Mạng chậm, thử lại...";
  } finally {
    isSyncing = false;
  }
}, 2000);

// ============ TABLE PAGINATION & ACTIONS ============
let tableData = [];
let currentPage = 1;
const pageSize = 10;
let tableSearchQuery = "";
let editingCode = null;

async function refreshTableData() {
  const statusEl = document.getElementById("tableStatus");
  if (statusEl) statusEl.textContent = "Đang tải dữ liệu từ sheet...";
  try {
    const res = await fetch(`${API_URL}?action=getData`);
    const data = await res.json();
    // Lưu mới nhất lên đầu bằng cách đảo ngược mảng nhận được từ sheet
    tableData = Array.isArray(data) ? data.filter(item => item && item.code && String(item.code).trim() !== '').reverse() : [];
    renderTable();
  } catch (err) {
    if (statusEl) statusEl.textContent = "❌ Lỗi tải: " + err;
  }
}

function isUnusualCode(code) {
  const upper = String(code).toUpperCase().trim();
  return !upper.startsWith("FRK") && !upper.startsWith("TR80001");
}

function renderTable() {
  const tbody = document.getElementById("tableBody");
  const pageIndicator = document.getElementById("pageIndicator");
  const btnPrev = document.getElementById("btnPrevPage");
  const btnNext = document.getElementById("btnNextPage");
  const statusEl = document.getElementById("tableStatus");
  
  if (!tbody) return;
  
  let filtered = tableData.filter(item => item && item.code && String(item.code).trim() !== '');
  if (tableSearchQuery) {
    const q = tableSearchQuery.toLowerCase();
    filtered = filtered.filter(item => 
      String(item.code || '').toLowerCase().includes(q) || 
      String(item.reason || '').toLowerCase().includes(q)
    );
  }
  
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  
  if (currentPage > totalPages) {
    currentPage = totalPages;
  }
  
  pageIndicator.textContent = `Trang ${currentPage} / ${totalPages}`;
  btnPrev.disabled = (currentPage === 1);
  btnNext.disabled = (currentPage === totalPages);
  statusEl.textContent = `Tổng cộng: ${totalItems} dòng`;
  
  const start = (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, totalItems);
  const pageItems = filtered.slice(start, end);
  
  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);">Không có dữ liệu</td></tr>`;
  } else {
    tbody.innerHTML = pageItems.map((item, index) => {
      const isEditing = (editingCode !== null && String(editingCode).trim() === String(item.code).trim());
      
      let qtyCell = "";
      let reasonCell = "";
      let actionButtons = "";
      
      if (isEditing) {
        qtyCell = `
          <input type="number" id="editQty_${item.code}" value="${item.qty || '1'}" min="1" style="width: 70px; text-align: center; padding: 6px; border: 1.5px solid var(--primary); border-radius: 6px; outline: none; margin: 0; font-weight: 700;" />
        `;
        reasonCell = `
          <div style="display: flex; gap: 6px; align-items: center;">
            <input type="text" id="editReason_${item.code}" value="${item.reason}" class="inline-reason-edit" style="margin:0; max-width: 250px;" />
          </div>
        `;
        actionButtons = `
          <button onclick="saveInlineReason('${item.code}')" style="width: auto; padding: 6px 12px; font-size: 13px; background-color: var(--success); margin: 0; box-shadow: none;">Lưu</button>
          <button onclick="cancelInlineEdit()" class="btn-secondary" style="width: auto; padding: 6px 12px; font-size: 13px; margin: 0; box-shadow: none;">Hủy</button>
        `;
      } else {
        qtyCell = `<span style="font-weight: 700; color: var(--text-color);">${item.qty || '1'}</span>`;
        reasonCell = `<span class="reason-text">${item.reason || '<em style="color:#9ca3af;">Trống</em>'}</span>`;
        actionButtons = `
          <button onclick="startInlineEdit('${item.code}')" class="btn-secondary" style="width: auto; padding: 6px 12px; font-size: 13px; margin: 0; box-shadow: none;">Sửa</button>
          <button onclick="deleteTableCode('${item.code}')" style="width: auto; padding: 6px 12px; font-size: 13px; background-color: var(--danger); margin: 0; box-shadow: none;">Xóa</button>
        `;
      }
      
      return `
        <tr>
          <td style="text-align: center;">${item.stt}</td>
          <td style="font-weight: 600; color: var(--primary);">${item.code}</td>
          <td style="text-align: center;">${qtyCell}</td>
          <td>${reasonCell}</td>
          <td style="font-size: 13px; color: var(--text-muted);">${item.time || ''}</td>
          <td>
            <div style="display: flex; gap: 8px; justify-content: center; align-items: center;">
              ${actionButtons}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }
  
  // Render Bảng các mã sai định dạng/bất thường
  renderUnusualTable();
}

function renderUnusualTable() {
  const tbody = document.getElementById("unusualTableBody");
  const badge = document.getElementById("unusualCountBadge");
  if (!tbody) return;
  
  const unusualItems = tableData.filter(item => isUnusualCode(item.code));
  if (badge) badge.textContent = unusualItems.length;
  
  if (unusualItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #b45309;">Không có mã bất thường</td></tr>`;
    return;
  }
  
  tbody.innerHTML = unusualItems.map((item, index) => {
    const isEditing = (editingCode !== null && String(editingCode).trim() === String(item.code).trim());
    let qtyCell = "";
    let reasonCell = "";
    let actionButtons = "";
    
    if (isEditing) {
      qtyCell = `
        <input type="number" id="editQty_unusual_${item.code}" value="${item.qty || '1'}" min="1" style="width: 70px; text-align: center; padding: 6px; border: 1.5px solid #fcd34d; border-radius: 6px; outline: none; margin: 0; font-weight: 700;" />
      `;
      reasonCell = `
        <div style="display: flex; gap: 6px; align-items: center;">
          <input type="text" id="editReason_unusual_${item.code}" value="${item.reason}" class="inline-reason-edit" style="margin:0; max-width: 250px; border-color: #fcd34d;" />
        </div>
      `;
      actionButtons = `
        <button onclick="saveInlineReason('${item.code}')" style="width: auto; padding: 6px 12px; font-size: 13px; background-color: var(--success); margin: 0; box-shadow: none;">Lưu</button>
        <button onclick="cancelInlineEdit()" class="btn-secondary" style="width: auto; padding: 6px 12px; font-size: 13px; margin: 0; box-shadow: none;">Hủy</button>
      `;
    } else {
      qtyCell = `<span style="font-weight: 700; color: #92400e;">${item.qty || '1'}</span>`;
      reasonCell = `<span>${item.reason || '<em style="color:#9ca3af;">Trống</em>'}</span>`;
      actionButtons = `
        <button onclick="startInlineEdit('${item.code}')" class="btn-secondary" style="width: auto; padding: 6px 12px; font-size: 13px; margin: 0; box-shadow: none;">Sửa</button>
        <button onclick="deleteTableCode('${item.code}')" style="width: auto; padding: 6px 12px; font-size: 13px; background-color: var(--danger); margin: 0; box-shadow: none;">Xóa</button>
      `;
    }
    
    return `
      <tr style="background-color: #fffbeb;">
        <td style="text-align: center; color: #92400e; font-weight: 500;">${item.stt}</td>
        <td style="font-weight: 600; color: #b45309;">${item.code}</td>
        <td style="text-align: center;">${qtyCell}</td>
        <td style="color: #92400e;">${reasonCell}</td>
        <td style="font-size: 13px; color: #b45309;">${item.time || ''}</td>
        <td>
          <div style="display: flex; gap: 8px; justify-content: center; align-items: center;">
            ${actionButtons}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    renderTable();
  }
}

function nextPage() {
  const totalPages = Math.ceil(tableData.length / pageSize);
  if (currentPage < totalPages) {
    currentPage++;
    renderTable();
  }
}

function handleTableSearch() {
  tableSearchQuery = document.getElementById("searchTableInput").value.trim();
  currentPage = 1;
  renderTable();
}

// Kiểm tra xem có đang ở chế độ mobile không (cột bị ẩn)
function isMobileView() {
  return window.innerWidth <= 768;
}

function startInlineEdit(code) {
  const cleanCode = String(code).trim();
  
  if (isMobileView()) {
    // Mobile: mở popup modal
    openEditModal(cleanCode);
  } else {
    // Desktop: inline edit trong bảng
    editingCode = cleanCode;
    renderTable();
    setTimeout(() => {
      let input = document.getElementById(`editReason_${editingCode}`);
      if (!input) {
        input = document.getElementById(`editReason_unusual_${editingCode}`);
      }
      if (input) input.focus();
    }, 50);
  }
}

function cancelInlineEdit() {
  editingCode = null;
  renderTable();
}

// ============ EDIT MODAL (Mobile Popup) ============
function openEditModal(code) {
  const item = tableData.find(d => String(d.code).trim() === code);
  if (!item) return;
  
  const modal = document.getElementById("editModal");
  document.getElementById("editModalCode").value = item.code;
  document.getElementById("editModalQty").value = item.qty || "1";
  document.getElementById("editModalReason").value = item.reason || "";
  
  modal.style.display = "flex";
  // Ngăn scroll body khi modal mở
  document.body.style.overflow = "hidden";
  
  // Focus vào ô Số Kiện
  setTimeout(() => {
    document.getElementById("editModalQty").focus();
  }, 100);
}

function closeEditModal() {
  const modal = document.getElementById("editModal");
  modal.style.display = "none";
  document.body.style.overflow = "";
}

async function saveEditModal() {
  const code = document.getElementById("editModalCode").value.trim();
  const newQty = document.getElementById("editModalQty").value.trim() || "1";
  const newReason = document.getElementById("editModalReason").value.trim();
  
  if (!code) return;
  
  closeEditModal();
  document.getElementById("message").textContent = `⏳ Đang lưu thông tin cho mã ${code}...`;
  
  try {
    const res = await fetch(`${API_URL}?action=updateRow&code=${encodeURIComponent(code)}&reason=${encodeURIComponent(newReason)}&qty=${encodeURIComponent(newQty)}`);
    const text = await res.text();
    document.getElementById("message").textContent = text;
    
    const idx = tableData.findIndex(item => String(item.code).trim() === code);
    if (idx !== -1) {
      tableData[idx].reason = newReason;
      tableData[idx].qty = newQty;
    }
    
    editingCode = null;
    renderTable();
  } catch (err) {
    alert("❌ Lỗi cập nhật: " + err);
  }
}

async function saveInlineReason(code) {
  const cleanCode = String(code).trim();
  let inputReason = document.getElementById(`editReason_${cleanCode}`);
  let inputQty = document.getElementById(`editQty_${cleanCode}`);
  if (!inputReason) {
    inputReason = document.getElementById(`editReason_unusual_${cleanCode}`);
    inputQty = document.getElementById(`editQty_unusual_${cleanCode}`);
  }
  if (!inputReason) return;
  const newReason = inputReason.value.trim();
  const newQty = inputQty ? inputQty.value.trim() : "1";
  
  document.getElementById("message").textContent = `⏳ Đang lưu thông tin cho mã ${cleanCode}...`;
  
  try {
    const res = await fetch(`${API_URL}?action=updateRow&code=${encodeURIComponent(cleanCode)}&reason=${encodeURIComponent(newReason)}&qty=${encodeURIComponent(newQty)}`);
    const text = await res.text();
    document.getElementById("message").textContent = text;
    
    const idx = tableData.findIndex(item => String(item.code).trim() === cleanCode);
    if (idx !== -1) {
      tableData[idx].reason = newReason;
      tableData[idx].qty = newQty;
    }
    
    editingCode = null;
    renderTable();
  } catch (err) {
    alert("❌ Lỗi cập nhật: " + err);
  }
}

async function deleteTableCode(code) {
  const cleanCode = String(code).trim();
  if (!confirm(`Bạn có chắc chắn muốn xóa mã "${cleanCode}" khỏi sheet?`)) return;
  
  document.getElementById("message").textContent = `⏳ Đang xóa mã ${cleanCode}...`;
  
  try {
    const res = await fetch(`${API_URL}?action=deleteRow&code=${encodeURIComponent(cleanCode)}`);
    const text = await res.text();
    document.getElementById("message").textContent = text;
    
    tableData = tableData.filter(item => String(item.code).trim() !== cleanCode);
    
    scannedCodes.delete(cleanCode);
    localStorage.setItem("scannedCodes", JSON.stringify([...scannedCodes]));
    
    editingCode = null;
    renderTable();
  } catch (err) {
    alert("❌ Lỗi xóa mã: " + err);
  }
}

// ---- Nhấn Enter thì thêm vào buffer ----
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("maDon");
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveMaDon();
    }
  });
  updateCurrentSheet();
  
  // Khôi phục danh sách mã lạ khi F5
  scannedCodes.forEach(c => updateUnusualCodesDisplay(c));
});

// 🧾 Tạo sheet mới
function createNewSheet() {
  const name = document.getElementById("newSheetName").value.trim();
  if (!name) return alert("Nhập tên sheet cần tạo!");
  fetch(`${API_URL}?action=newSheet&name=${encodeURIComponent(name)}`)
    .then((res) => res.text())
    .then((msg) => {
      document.getElementById("message").textContent = msg;
      
      // Xoá dữ liệu mã quét tạm khi tạo trang mới để bắt đầu phiên mới
      scannedCodes.clear();
      localStorage.removeItem("scannedCodes");
      
      const area = document.getElementById("unusualCodes");
      if (area) area.value = "";
      
      updateCurrentSheet();
      refreshTableData();
    })
    .catch((err) => alert("❌ Lỗi: " + err));
}

// 📄 Xuất PDF (có progress bar)
function exportPDF() {
  const sheetName = document.getElementById("sheetToExport").value.trim();
  if (!sheetName) return alert("Nhập tên sheet cần xuất PDF!");

  const btn = document.getElementById("btnExportPDF");
  const wrapper = document.getElementById("progressWrapper");
  const bar = document.getElementById("progressBar");
  const text = document.getElementById("progressText");

  // Hiển thị progress bar, disable nút
  btn.disabled = true;
  btn.textContent = "⏳ Đang xuất PDF...";
  wrapper.style.display = "block";
  bar.style.width = "0%";
  text.textContent = "0%";
  document.getElementById("message").textContent = "";

  // Giả lập tiến trình tăng dần (0% → 90%)
  let progress = 0;
  const interval = setInterval(() => {
    if (progress < 90) {
      progress += Math.random() * 8 + 2; // tăng 2-10% mỗi lần
      if (progress > 90) progress = 90;
      bar.style.width = progress + "%";
      text.textContent = Math.round(progress) + "%";
    }
  }, 500);

  fetch(
    `${API_URL}?action=exportPDF&sheetName=${encodeURIComponent(sheetName)}`
  )
    .then((res) => res.text())
    .then((url) => {
      clearInterval(interval);
      // Hoàn tất 100%
      bar.style.width = "100%";
      text.textContent = "100%";

      setTimeout(() => {
        if (url.startsWith("http")) {
          window.open(url, "_blank");
          document.getElementById("message").textContent = "✅ Xuất PDF thành công!";
        } else {
          document.getElementById("message").textContent = url;
        }
        // Ẩn progress bar sau 1.5s
        setTimeout(() => {
          wrapper.style.display = "none";
          bar.style.width = "0%";
          text.textContent = "0%";
        }, 1500);
        btn.disabled = false;
        btn.textContent = "📄 Xuất PDF";
      }, 600);
    })
    .catch((err) => {
      clearInterval(interval);
      wrapper.style.display = "none";
      btn.disabled = false;
      btn.textContent = "📄 Xuất PDF";
      alert("❌ Lỗi: " + err);
    });
}

// ============ CAMERA SCANNER LOGIC (Barcode & QR Code) ============
let html5QrCode = null;
let cameraStarting = false; // Chống bấm liên tục gây lỗi
let scanCooldown = false;   // Chống quét liên tục — chỉ quét 1 lần rồi dừng

// Phát âm thanh bip bíp khi quét mã thành công (Sử dụng Web Audio API không cần tải file nhạc)
function playScanBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime); // 1200Hz
    gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.08); // Kéo dài 0.08s
  } catch (e) {
    console.warn("Không phát được âm thanh báo quét: ", e);
  }
}

// Hiển thị thanh trạng thái quét
function showScanStatusBar(visible) {
  const bar = document.getElementById("scanStatusBar");
  if (bar) bar.style.display = visible ? "block" : "none";
}

// Chuyển trạng thái quét: "waiting" = đang chờ quét, "done" = hoàn tất
function setScanStatus(status) {
  const waiting = document.getElementById("scanStatusWaiting");
  const done = document.getElementById("scanStatusDone");
  if (!waiting || !done) return;
  
  if (status === "done") {
    waiting.style.display = "none";
    done.style.display = "block";
  } else {
    // "waiting" — đang chờ quét
    waiting.style.display = "flex";
    done.style.display = "none";
  }
}

// Tự động resume scanner sau cooldown
function autoResumeScanning() {
  scanCooldown = false;
  setScanStatus("waiting");
  
  // Resume scanner nếu đang bị pause
  if (html5QrCode) {
    try {
      const state = html5QrCode.getState();
      if (state === Html5QrcodeScannerState.PAUSED) {
        html5QrCode.resume();
      }
    } catch (e) {
      console.warn("Không thể resume scanner:", e);
    }
  }
}

// Dọn dẹp hoàn toàn instance camera cũ
async function cleanupCamera() {
  scanCooldown = false;
  if (html5QrCode) {
    try {
      // Kiểm tra xem scanner có đang chạy không trước khi stop
      const state = html5QrCode.getState();
      if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
        await html5QrCode.stop();
      }
    } catch (e) {
      console.warn("Lỗi khi stop camera cũ:", e);
    }
    try {
      html5QrCode.clear();
    } catch (e) {
      console.warn("Lỗi khi clear camera cũ:", e);
    }
    html5QrCode = null;
  }
  // Xóa sạch nội dung cũ trong #reader div để tránh lỗi DOM khi tạo instance mới
  const readerDiv = document.getElementById("reader");
  if (readerDiv) {
    readerDiv.innerHTML = "";
  }
}

// Bật/tắt camera quét
async function toggleCameraScan() {
  const section = document.getElementById("cameraScanSection");
  const btn = document.getElementById("btnToggleCamera");
  if (!section || !btn) return;
  
  // Chống bấm liên tục
  if (cameraStarting) return;
  
  if (section.style.display === "none") {
    section.style.display = "block";
    btn.innerHTML = `
      <svg class="icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width: 16px; height: 16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      Đóng Camera
    `;
    btn.style.color = "var(--danger)";
    btn.style.borderColor = "var(--danger)";
    await startCameraScan();
  } else {
    await stopCameraScan();
  }
}

// Bắt đầu quét camera
async function startCameraScan() {
  scanCooldown = false;
  cameraStarting = true;

  // Dọn dẹp instance cũ hoàn toàn trước khi tạo mới
  await cleanupCamera();
  
  // Hiển thị trạng thái "Đang chờ quét..."
  showScanStatusBar(true);
  setScanStatus("waiting");
  
  html5QrCode = new Html5Qrcode("reader", {
    // Hỗ trợ quét cả QR Code và tất cả loại Barcode phổ biến
    formatsToSupport: [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.CODE_93,
      Html5QrcodeSupportedFormats.ITF,
      Html5QrcodeSupportedFormats.DATA_MATRIX
    ]
  });
  
  const config = {
    fps: 15,
    qrbox: function(width, height) {
      // Ô quét to hơn cho điện thoại — chiếm 90% chiều rộng, 70% chiều cao
      const boxWidth = Math.min(Math.round(width * 0.9), 500);
      const boxHeight = Math.min(Math.round(height * 0.7), 350);
      return { width: boxWidth, height: boxHeight };
    },
    // Tỷ lệ 4:3 phù hợp điện thoại dọc hơn 16:9
    aspectRatio: 1.333334
  };
  
  const onScanSuccess = (decodedText) => {
    // ⚡ Chống quét liên tục: nếu đang trong cooldown thì bỏ qua
    if (scanCooldown) return;
    scanCooldown = true;
    
    // Phát bíp 1 lần duy nhất
    playScanBeep();
    
    // Tạm dừng scanner ngay lập tức để không nhận diện tiếp
    if (html5QrCode) {
      try {
        html5QrCode.pause(/* pauseVideo= */ false); // Pause scan nhưng vẫn hiển thị camera
      } catch (e) {
        console.warn("Không thể pause scanner:", e);
      }
    }
    
    // Hiển thị trạng thái "Hoàn tất"
    const resVal = document.getElementById("scannedTextValue");
    if (resVal) resVal.textContent = decodedText;
    setScanStatus("done");
    
    // Lưu mã vào buffer
    const input = document.getElementById("maDon");
    if (input) {
      input.value = decodedText;
      saveMaDon();
    }
    
    // ⏳ Tự động quay lại trạng thái "Đang chờ quét" sau 2 giây
    setTimeout(() => {
      autoResumeScanning();
    }, 2000);
  };
  
  const onScanFailure = (errorMessage) => {
    // Bỏ qua lỗi quét liên tục (không tìm thấy mã) — đây là bình thường
  };

  try {
    // Thử mở camera sau (environment) trước
    await html5QrCode.start(
      { facingMode: "environment" },
      config,
      onScanSuccess,
      onScanFailure
    );
    cameraStarting = false;
    return; // Thành công, thoát
  } catch (envErr) {
    console.warn("Không mở được camera sau (environment), thử camera khác:", envErr);
  }

  try {
    // Fallback: lấy danh sách camera và dùng camera đầu tiên có sẵn
    const devices = await Html5Qrcode.getCameras();
    if (devices && devices.length > 0) {
      // Ưu tiên camera sau (tên thường chứa "back", "rear", "environment")
      const backCam = devices.find(d => 
        /back|rear|environment/i.test(d.label)
      );
      const cameraId = backCam ? backCam.id : devices[0].id;
      
      // Cần tạo lại instance vì instance cũ có thể ở trạng thái lỗi
      await cleanupCamera();
      html5QrCode = new Html5Qrcode("reader");
      
      await html5QrCode.start(
        cameraId,
        config,
        onScanSuccess,
        onScanFailure
      );
      cameraStarting = false;
      return; // Thành công
    } else {
      throw new Error("Không tìm thấy camera nào trên thiết bị.");
    }
  } catch (fallbackErr) {
    console.error("Lỗi mở camera (tất cả phương thức):", fallbackErr);
    
    let errorMsg = "❌ Không mở được camera.";
    const errStr = String(fallbackErr);
    
    if (errStr.includes("NotAllowedError") || errStr.includes("Permission")) {
      errorMsg += "\n👉 Bạn cần cấp quyền camera trong trình duyệt.\nVào Cài đặt > Quyền riêng tư > Camera và cho phép trang web này.";
    } else if (errStr.includes("NotFoundError") || errStr.includes("Không tìm thấy")) {
      errorMsg += "\n👉 Không tìm thấy camera trên thiết bị này.";
    } else if (errStr.includes("NotReadableError") || errStr.includes("TrackStartError")) {
      errorMsg += "\n👉 Camera đang được sử dụng bởi ứng dụng khác. Hãy đóng các ứng dụng khác đang dùng camera rồi thử lại.";
    } else if (errStr.includes("OverconstrainedError")) {
      errorMsg += "\n👉 Camera không hỗ trợ cấu hình yêu cầu.";
    } else {
      errorMsg += "\n👉 " + fallbackErr.message || fallbackErr;
    }
    
    alert(errorMsg);
    await stopCameraScan();
    cameraStarting = false;
  }
}

// Tắt camera quét
async function stopCameraScan() {
  const section = document.getElementById("cameraScanSection");
  const btn = document.getElementById("btnToggleCamera");
  if (section) section.style.display = "none";
  
  // Ẩn thanh trạng thái quét
  showScanStatusBar(false);
  
  if (btn) {
    btn.innerHTML = `
      <svg class="icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width: 16px; height: 16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
      Quét Camera
    `;
    btn.style.color = "var(--primary)";
    btn.style.borderColor = "var(--primary)";
  }
  
  await cleanupCamera();
}