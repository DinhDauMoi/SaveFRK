// ΓÜÖ∩╕Å D├ín URL Web App cß╗ºa bß║ín tß║íi ─æ├óy
const API_URL =
  "https://script.google.com/macros/s/AKfycbyb9rBPg6N1AiXY0-5UCxHOZuWv8NUIKgmZoIXU8Or2Opann5416_L62eQQGL-dvngE/exec";

let buffer = []; // l╞░u tß║ím c├íc m├ú ch╞░a gß╗¡i
let isSyncing = false; // trß║íng th├íi ─æang ─æß╗ông bß╗Ö
let scannedCodes = new Set(); // l╞░u trß╗» m├ú ─æ├ú qu├⌐t trong phi├¬n ─æß╗â kiß╗âm tra tr├╣ng lß║╖p

// Kh├┤i phß╗Ñc m├ú ─æ├ú qu├⌐t tß╗½ localStorage ─æß╗â chß╗æng tr├╣ng ngay cß║ú khi tß║úi lß║íi trang
try {
  const saved = JSON.parse(localStorage.getItem("scannedCodes"));
  if (Array.isArray(saved)) {
    scannedCodes = new Set(saved);
  }
} catch (e) {}

// Cß║¡p nhß║¡t giao diß╗çn: hiß╗ân thß╗ï c├íc m├ú lß║í
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

// Γ£à Th├¬m m├ú v├áo bß╗Ö nhß╗¢ tß║ím
function saveMaDon() {
  const input = document.getElementById("maDon");
  const maDon = input.value.trim();
  if (!maDon) return;

  // Lß╗ìc tr├╣ng: Kiß╗âm tra xem m├ú ─æ├ú ─æ╞░ß╗úc qu├⌐t ch╞░a (trong phi├¬n hoß║╖c trong buffer chß╗¥ gß╗¡i)
  if (scannedCodes.has(maDon) || buffer.includes(maDon)) {
    document.getElementById("message").textContent = `Γ¥î Tr├╣ng lß║╖p: M├ú "${maDon}" ─æ├ú ─æ╞░ß╗úc qu├⌐t! Kh├┤ng l╞░u.`;
    input.value = "";
    input.focus();
    return;
  }

  // ==== T├¼m kiß║┐m / Tra cß╗⌐u m├ú ====
  const targetArea = document.getElementById("targetsInput");
  let isTargetFound = false;
  if (targetArea && targetArea.value.trim() !== "") {
    let lines = targetArea.value.split('\n');
    let matched = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === maDon) {
        lines[i] = lines[i] + " Γ£à";
        matched = true;
        isTargetFound = true;
      }
    }
    if (matched) {
      targetArea.value = lines.join('\n');
      targetArea.dispatchEvent(new Event('input')); // Update display count
    }
  }

  // Th├¬m v├áo danh s├ích ─æ├ú qu├⌐t v├á l╞░u cß╗Ñc bß╗Ö
  scannedCodes.add(maDon);
  localStorage.setItem("scannedCodes", JSON.stringify([...scannedCodes]));

  // Cß║únh b├ío nß║┐u m├ú ─æß╗ïnh dß║íng lß║í
  updateUnusualCodesDisplay(maDon);

  buffer.push(maDon);
  input.value = "";
  input.focus();
  
  if (isTargetFound) {
    document.getElementById("message").textContent = `≡ƒÄ» T├îM THß║ñY M├â TRA Cß╗¿U: ${maDon}`;
  } else {
    document.getElementById("message").textContent = `≡ƒôÑ ─É├ú th├¬m tß║ím: ${maDon} (${buffer.length} m├ú chß╗¥ l╞░u)`;
  }
}

// ≡ƒöü Tß╗▒ ─æß╗Öng gß╗¡i dß╗» liß╗çu nß╗ün mß╗ùi 2 gi├óy
setInterval(async () => {
  if (isSyncing || buffer.length === 0) return;
  isSyncing = true;

  const batch = [...buffer];
  buffer = []; // tß║ím l├ám rß╗ùng tr╞░ß╗¢c

  try {
    const res = await fetch(`${API_URL}?action=batchSave`, {
      method: "POST",
      body: JSON.stringify(batch),
    });
    const msg = await res.text();
    document.getElementById("message").textContent = `Γ£à ${msg}`;
  } catch (err) {
    // nß║┐u lß╗ùi, kh├┤i phß╗Ñc buffer
    localStorage.setItem("buffer", JSON.stringify(buffer));
    buffer = [...batch, ...buffer];
    document.getElementById("message").textContent = "ΓÜá∩╕Å Mß║íng chß║¡m, thß╗¡ lß║íi...";
  } finally {
    isSyncing = false;
  }
}, 2000);

// ---- Nhß║Ñn Enter th├¼ th├¬m v├áo buffer ----
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("maDon");
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveMaDon();
    }
  });
  updateCurrentSheet();
  
  // Kh├┤i phß╗Ñc danh s├ích m├ú lß║í khi F5
  scannedCodes.forEach(c => updateUnusualCodesDisplay(c));
});

// ≡ƒº╛ Tß║ío sheet mß╗¢i
function createNewSheet() {
  const name = document.getElementById("newSheetName").value.trim();
  if (!name) return alert("Nhß║¡p t├¬n sheet cß║ºn tß║ío!");
  fetch(`${API_URL}?action=newSheet&name=${encodeURIComponent(name)}`)
    .then((res) => res.text())
    .then((msg) => {
      document.getElementById("message").textContent = msg;
      
      // Xo├í dß╗» liß╗çu m├ú qu├⌐t tß║ím khi tß║ío trang mß╗¢i ─æß╗â bß║»t ─æß║ºu phi├¬n mß╗¢i
      scannedCodes.clear();
      localStorage.removeItem("scannedCodes");
      
      const area = document.getElementById("unusualCodes");
      if (area) area.value = "";
      
      updateCurrentSheet();
    })
    .catch((err) => alert("Γ¥î Lß╗ùi: " + err));
}

// ≡ƒôä Xuß║Ñt PDF (c├│ progress bar)
function exportPDF() {
  const sheetName = document.getElementById("sheetToExport").value.trim();
  if (!sheetName) return alert("Nhß║¡p t├¬n sheet cß║ºn xuß║Ñt PDF!");

  const btn = document.getElementById("btnExportPDF");
  const wrapper = document.getElementById("progressWrapper");
  const bar = document.getElementById("progressBar");
  const text = document.getElementById("progressText");

  // Hiß╗ân thß╗ï progress bar, disable n├║t
  btn.disabled = true;
  btn.textContent = "ΓÅ│ ─Éang xuß║Ñt PDF...";
  wrapper.style.display = "block";
  bar.style.width = "0%";
  text.textContent = "0%";
  document.getElementById("message").textContent = "";

  // Giß║ú lß║¡p tiß║┐n tr├¼nh t─âng dß║ºn (0% ΓåÆ 90%)
  let progress = 0;
  const interval = setInterval(() => {
    if (progress < 90) {
      progress += Math.random() * 8 + 2; // t─âng 2-10% mß╗ùi lß║ºn
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
      // Ho├án tß║Ñt 100%
      bar.style.width = "100%";
      text.textContent = "100%";

      setTimeout(() => {
        if (url.startsWith("http")) {
          window.open(url, "_blank");
          document.getElementById("message").textContent = "Γ£à Xuß║Ñt PDF th├ánh c├┤ng!";
        } else {
          document.getElementById("message").textContent = url;
        }
        // ß║¿n progress bar sau 1.5s
        setTimeout(() => {
          wrapper.style.display = "none";
          bar.style.width = "0%";
          text.textContent = "0%";
        }, 1500);
        btn.disabled = false;
        btn.textContent = "≡ƒôä Xuß║Ñt PDF";
      }, 600);
    })
    .catch((err) => {
      clearInterval(interval);
      wrapper.style.display = "none";
      btn.disabled = false;
      btn.textContent = "≡ƒôä Xuß║Ñt PDF";
      alert("Γ¥î Lß╗ùi: " + err);
    });
}
