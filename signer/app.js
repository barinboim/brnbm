import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";

const ENCRYPTED_BUNDLE = "signatures.enc.json";
const RENDER_SCALE = 2;
const CACHE_BUSTER = Date.now();

const state = {
  pdfBytes: null,
  pdfDocument: null,
  filename: "document.pdf",
  pages: [],
  signatures: [],
  placements: [],
  selectedId: null,
  zoom: 1,
};

const els = {
  pdfInput: document.querySelector("#pdfInput"),
  signatureSelect: document.querySelector("#signatureSelect"),
  addSignature: document.querySelector("#addSignature"),
  deleteSelected: document.querySelector("#deleteSelected"),
  downloadPdf: document.querySelector("#downloadPdf"),
  viewer: document.querySelector("#viewer"),
  zoomRange: document.querySelector("#zoomRange"),
  sizeRange: document.querySelector("#sizeRange"),
  signaturePreview: document.querySelector("#signaturePreview"),
  status: document.querySelector("#status"),
  passwordOverlay: document.querySelector("#passwordOverlay"),
  passwordForm: document.querySelector("#passwordForm"),
  passwordInput: document.querySelector("#passwordInput"),
  passwordError: document.querySelector("#passwordError"),
};

function setStatus(message) {
  els.status.textContent = message;
}

function selectedSignature() {
  return state.signatures.find((item) => item.name === els.signatureSelect.value);
}

function pageScale(pageElement) {
  return Number(pageElement.dataset.zoom || state.zoom);
}

function b64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveBundleKey(password, bundle) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: b64ToBytes(bundle.salt),
      iterations: bundle.iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

async function decryptItem(key, item) {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(item.iv) },
    key,
    b64ToBytes(item.ciphertext),
  );
  return new Uint8Array(plaintext);
}

function renderSignatureOptions() {
  els.signatureSelect.innerHTML = "";
  for (const signature of state.signatures) {
    const option = document.createElement("option");
    option.value = signature.name;
    option.textContent = signature.label;
    els.signatureSelect.append(option);
  }
  renderSignaturePreview();
}

function renderSignaturePreview() {
  const signature = selectedSignature();
  els.signaturePreview.innerHTML = "";
  if (!signature) {
    els.signaturePreview.textContent = "No PNG signatures found";
    return;
  }
  const image = document.createElement("img");
  image.src = signature.url;
  image.alt = signature.label;
  els.signaturePreview.append(image);
}

function loadImageMeta(signature) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      signature.width = img.naturalWidth;
      signature.height = img.naturalHeight;
      resolve(signature);
    };
    img.onerror = () => {
      signature.width = 1;
      signature.height = 1;
      resolve(signature);
    };
    img.src = signature.url;
  });
}

let encryptedBundle = null;

async function fetchEncryptedBundle() {
  if (encryptedBundle) return encryptedBundle;
  const response = await fetch(`${ENCRYPTED_BUNDLE}?t=${CACHE_BUSTER}`, { cache: "no-store" });
  if (!response.ok) throw new Error("signatures.enc.json not found");
  encryptedBundle = await response.json();
  return encryptedBundle;
}

async function unlockSignatures(password) {
  const bundle = await fetchEncryptedBundle();
  const key = await deriveBundleKey(password, bundle);

  const decrypted = await Promise.all(
    bundle.items.map(async (item) => {
      const bytes = await decryptItem(key, item);
      const blob = new Blob([bytes], { type: "image/png" });
      return {
        name: item.name,
        label: item.label ?? item.name.replace(/\.png$/i, ""),
        bytes,
        url: URL.createObjectURL(blob),
        width: 1,
        height: 1,
      };
    }),
  );

  state.signatures = decrypted;
  await Promise.all(state.signatures.map(loadImageMeta));
  renderSignatureOptions();
}

async function renderPages() {
  els.viewer.innerHTML = "";
  for (const page of state.pages) {
    const shell = document.createElement("div");
    shell.className = "page-shell";

    const label = document.createElement("div");
    label.className = "page-label";
    label.textContent = `Page ${page.index + 1}`;

    const pageElement = document.createElement("div");
    pageElement.className = "page";
    pageElement.dataset.pageIndex = String(page.index);
    pageElement.dataset.zoom = String(state.zoom);
    pageElement.style.width = `${page.width * state.zoom}px`;
    pageElement.style.height = `${page.height * state.zoom}px`;

    const canvas = document.createElement("canvas");
    canvas.className = "pdf-page";
    pageElement.append(canvas);

    pageElement.addEventListener("pointerdown", () => selectPlacement(null));

    shell.append(label, pageElement);
    els.viewer.append(shell);

    renderPageToCanvas(page, canvas).catch((error) => {
      console.error("Failed to render page", error);
    });
  }
  renderPlacements();
}

async function renderPageToCanvas(page, canvas) {
  const pdfPage = await state.pdfDocument.getPage(page.index + 1);
  const viewport = pdfPage.getViewport({ scale: RENDER_SCALE });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  await pdfPage.render({ canvasContext: context, viewport }).promise;
}

function renderPlacements() {
  document.querySelectorAll(".signature").forEach((node) => node.remove());

  for (const placement of state.placements) {
    const pageElement = document.querySelector(`.page[data-page-index="${placement.pageIndex}"]`);
    if (!pageElement) continue;

    const scale = pageScale(pageElement);
    const signature = state.signatures.find((item) => item.name === placement.signature);
    if (!signature) continue;

    const node = document.createElement("div");
    node.className = "signature";
    if (placement.id === state.selectedId) node.classList.add("selected");
    node.dataset.id = placement.id;
    node.style.left = `${placement.x * scale}px`;
    node.style.top = `${placement.y * scale}px`;
    node.style.width = `${placement.width * scale}px`;
    node.style.height = `${placement.height * scale}px`;

    const image = document.createElement("img");
    image.src = signature.url;
    image.alt = signature.label;

    const handle = document.createElement("span");
    handle.className = "handle";
    handle.title = "Resize";

    node.append(image, handle);
    pageElement.append(node);

    node.addEventListener("pointerdown", (event) => startDrag(event, placement, pageElement));
    handle.addEventListener("pointerdown", (event) => startResize(event, placement, pageElement));
  }
  els.deleteSelected.disabled = !state.selectedId;
}

function selectPlacement(id) {
  state.selectedId = id;
  renderPlacements();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function pageForPlacement(pageIndex) {
  return state.pages.find((page) => page.index === pageIndex);
}

function startDrag(event, placement, pageElement) {
  if (event.target.classList.contains("handle")) return;
  event.preventDefault();
  event.stopPropagation();
  state.selectedId = placement.id;
  event.currentTarget.classList.add("selected");
  els.deleteSelected.disabled = false;

  const scale = pageScale(pageElement);
  const page = pageForPlacement(placement.pageIndex);
  const start = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    x: placement.x,
    y: placement.y,
  };

  event.currentTarget.setPointerCapture(event.pointerId);

  const onMove = (moveEvent) => {
    const dx = (moveEvent.clientX - start.pointerX) / scale;
    const dy = (moveEvent.clientY - start.pointerY) / scale;
    placement.x = clamp(start.x + dx, 0, page.width - placement.width);
    placement.y = clamp(start.y + dy, 0, page.height - placement.height);
    renderPlacements();
  };

  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, { once: true });
}

function startResize(event, placement, pageElement) {
  event.preventDefault();
  event.stopPropagation();
  state.selectedId = placement.id;
  event.currentTarget.parentElement.classList.add("selected");
  els.deleteSelected.disabled = false;

  const scale = pageScale(pageElement);
  const page = pageForPlacement(placement.pageIndex);
  const signature = state.signatures.find((item) => item.name === placement.signature);
  const ratio = signature.height / signature.width;
  const start = {
    pointerX: event.clientX,
    width: placement.width,
  };

  event.currentTarget.parentElement.setPointerCapture(event.pointerId);

  const onMove = (moveEvent) => {
    const dx = (moveEvent.clientX - start.pointerX) / scale;
    const width = clamp(start.width + dx, 20, page.width - placement.x);
    placement.width = width;
    placement.height = clamp(width * ratio, 12, page.height - placement.y);
    renderPlacements();
  };

  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, { once: true });
}

function addSignatureToFirstVisiblePage() {
  const signature = selectedSignature();
  if (!signature || !state.pages.length) return;

  const pageElement =
    document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.closest(".page") ||
    document.querySelector(".page");
  const pageIndex = Number(pageElement.dataset.pageIndex);
  const page = pageForPlacement(pageIndex);
  const desiredWidth = Number(els.sizeRange.value);
  const ratio = signature.height / signature.width;
  const width = Math.min(desiredWidth, page.width * 0.6);
  const height = width * ratio;
  const placement = {
    id: crypto.randomUUID(),
    pageIndex,
    signature: signature.name,
    x: (page.width - width) / 2,
    y: (page.height - height) / 2,
    width,
    height,
  };

  state.placements.push(placement);
  selectPlacement(placement.id);
  setStatus(`Added ${signature.label} to page ${pageIndex + 1}.`);
}

async function openPdfFile(file) {
  setStatus("Opening PDF...");
  const buffer = await file.arrayBuffer();
  state.pdfBytes = buffer.slice(0);
  state.filename = file.name;

  const loadingTask = pdfjsLib.getDocument({ data: buffer.slice(0) });
  state.pdfDocument = await loadingTask.promise;

  const pages = [];
  for (let i = 0; i < state.pdfDocument.numPages; i += 1) {
    const pdfPage = await state.pdfDocument.getPage(i + 1);
    const viewport = pdfPage.getViewport({ scale: 1 });
    pages.push({ index: i, width: viewport.width, height: viewport.height });
  }
  state.pages = pages;
  state.placements = [];
  state.selectedId = null;

  els.addSignature.disabled = state.signatures.length === 0;
  els.downloadPdf.disabled = false;
  await renderPages();
  setStatus(`Opened ${file.name}. Pages: ${state.pages.length}.`);
}

async function downloadSignedPdf() {
  if (!state.pdfBytes) return;
  setStatus("Building signed PDF...");

  const { PDFDocument } = window.PDFLib;
  const pdfDoc = await PDFDocument.load(state.pdfBytes);

  const embedCache = new Map();
  for (const placement of state.placements) {
    if (embedCache.has(placement.signature)) continue;
    const signature = state.signatures.find((s) => s.name === placement.signature);
    if (!signature) continue;
    embedCache.set(placement.signature, await pdfDoc.embedPng(signature.bytes));
  }

  const pages = pdfDoc.getPages();
  for (const placement of state.placements) {
    const page = pages[placement.pageIndex];
    if (!page) continue;
    const image = embedCache.get(placement.signature);
    const { height: pageHeight } = page.getSize();
    page.drawImage(image, {
      x: placement.x,
      y: pageHeight - placement.y - placement.height,
      width: placement.width,
      height: placement.height,
    });
  }

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `signed-${state.filename}`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Done. Signed PDF downloaded.");
}

els.pdfInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    await openPdfFile(file);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Failed to open PDF.");
  }
});

els.signatureSelect.addEventListener("change", renderSignaturePreview);
els.addSignature.addEventListener("click", addSignatureToFirstVisiblePage);
els.downloadPdf.addEventListener("click", () => {
  downloadSignedPdf().catch((error) => {
    console.error(error);
    setStatus("Failed to save PDF.");
  });
});
els.deleteSelected.addEventListener("click", () => {
  if (!state.selectedId) return;
  state.placements = state.placements.filter((placement) => placement.id !== state.selectedId);
  selectPlacement(null);
  setStatus("Signature deleted.");
});

els.zoomRange.addEventListener("input", () => {
  state.zoom = Number(els.zoomRange.value);
  renderPages();
});

window.addEventListener("keydown", (event) => {
  if ((event.key === "Delete" || event.key === "Backspace") && state.selectedId) {
    state.placements = state.placements.filter((placement) => placement.id !== state.selectedId);
    selectPlacement(null);
  }
});

function showPasswordError(message) {
  els.passwordError.textContent = message;
  els.passwordError.hidden = false;
}

function hidePasswordError() {
  els.passwordError.hidden = true;
}

function hidePasswordOverlay() {
  els.passwordOverlay.hidden = true;
}

els.passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hidePasswordError();
  const submit = els.passwordForm.querySelector("button");
  submit.disabled = true;
  submit.textContent = "Unlocking...";
  try {
    await unlockSignatures(els.passwordInput.value);
    hidePasswordOverlay();
    setStatus("Signatures unlocked. Open a PDF to start.");
  } catch (error) {
    console.error(error);
    if (error?.name === "OperationError") {
      showPasswordError("Wrong password.");
    } else {
      showPasswordError(error.message || "Failed to unlock.");
    }
    els.passwordInput.select();
  } finally {
    submit.disabled = false;
    submit.textContent = "Unlock";
  }
});

fetchEncryptedBundle().catch((error) => {
  console.error(error);
  showPasswordError("Encrypted bundle not found.");
});
