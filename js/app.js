(() => {
  const $ = (id) => document.getElementById(id);
  const fileInput = $("fileInput"), dropZone = $("dropZone"), editor = $("editor");
  const imageGrid = $("imageGrid"), generateButton = $("generateButton");
  let images = [], dragIndex = null, toastTimer;

  const showToast = (message) => {
    const toast = $("toast"); toast.textContent = message; toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
  };
  const safeName = (value) => {
    let name = (value || "").trim().replace(/\.pdf$/i, "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/[. ]+$/g, "").trim();
    return name || "document";
  };
  const formatBytes = (bytes) => bytes < 1024*1024 ? `${Math.max(1,Math.round(bytes/1024))} KB` : `${(bytes/(1024*1024)).toFixed(1)} MB`;
  const updateSummary = () => {
    $("imageCount").textContent = images.length;
    $("summaryPages").textContent = images.length;
    $("summarySize").textContent = images.length ? formatBytes(images.reduce((sum, item) => sum + item.file.size, 0) * Number($("quality").value) * .72) : "—";
    generateButton.disabled = images.length === 0;
    editor.classList.toggle("hidden", images.length === 0);
    $("statusMessage").textContent = images.length ? `${images.length} image${images.length === 1 ? "" : "s"} ready to convert.` : "Add images to get started.";
  };
  const render = () => {
    imageGrid.innerHTML = "";
    images.forEach((item, index) => {
      const card = document.createElement("article"); card.className = "image-card"; card.draggable = true;
      card.dataset.index = index;
      const thumb = document.createElement("div"); thumb.className = "image-thumb";
      const img = document.createElement("img"); img.src = item.url; img.alt = item.file.name; thumb.appendChild(img);
      const number = document.createElement("span"); number.className = "image-number"; number.textContent = `PAGE ${String(index+1).padStart(2,"0")}`;
      const meta = document.createElement("div"); meta.className = "image-meta";
      const info = document.createElement("div"); info.style.minWidth = "0";
      const name = document.createElement("div"); name.className = "image-name"; name.textContent = item.file.name; name.title = item.file.name;
      const size = document.createElement("div"); size.className = "image-size"; size.textContent = `${item.width} × ${item.height} · ${formatBytes(item.file.size)}`;
      info.append(name,size);
      const remove = document.createElement("button"); remove.className = "remove-image"; remove.type = "button"; remove.textContent = "×"; remove.setAttribute("aria-label",`Remove ${item.file.name}`);
      remove.addEventListener("click", () => removeImage(index));
      meta.append(info,remove); card.append(thumb,number,meta);
      card.addEventListener("dragstart", (e) => { dragIndex = index; card.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
      card.addEventListener("dragend", () => { dragIndex = null; card.classList.remove("dragging"); });
      card.addEventListener("dragover", (e) => e.preventDefault());
      card.addEventListener("drop", (e) => { e.preventDefault(); const target = Number(card.dataset.index); if (dragIndex !== null && dragIndex !== target) { const moved = images.splice(dragIndex,1)[0]; images.splice(target,0,moved); render(); } });
      imageGrid.appendChild(card);
    });
    updateSummary();
  };
  const removeImage = (index) => { URL.revokeObjectURL(images[index].url); images.splice(index,1); render(); };
  const addFiles = async (fileList) => {
    const accepted = Array.from(fileList).filter(f => ["image/jpeg","image/png","image/webp"].includes(f.type));
    const rejected = fileList.length - accepted.length;
    if (rejected) showToast(`${rejected} unsupported file${rejected===1?"":"s"} skipped. Use JPG, PNG or WEBP.`);
    for (const file of accepted) {
      try {
        const url = URL.createObjectURL(file);
        const dimensions = await new Promise((resolve,reject) => {
          const img = new Image(); img.onload = () => resolve({width:img.naturalWidth,height:img.naturalHeight}); img.onerror = reject; img.src = url;
        });
        images.push({file,url,...dimensions});
      } catch { showToast(`Could not read ${file.name}. It may be damaged.`); }
    }
    render(); fileInput.value = "";
  };
  const openPicker = () => fileInput.click();
  $("browseButton").addEventListener("click", (e) => { e.stopPropagation(); openPicker(); });
  $("addMoreButton").addEventListener("click", openPicker);
  dropZone.addEventListener("click", openPicker);
  dropZone.addEventListener("keydown", e => { if(e.key==="Enter"||e.key===" "){e.preventDefault();openPicker();} });
  fileInput.addEventListener("change", e => addFiles(Array.from(e.target.files)));
  ["dragenter","dragover"].forEach(type => dropZone.addEventListener(type, e => {e.preventDefault();dropZone.classList.add("dragover");}));
  ["dragleave","drop"].forEach(type => dropZone.addEventListener(type, e => {e.preventDefault();dropZone.classList.remove("dragover");}));
  dropZone.addEventListener("drop", e => addFiles(Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith("image/"))));
  $("clearButton").addEventListener("click", () => { images.forEach(i=>URL.revokeObjectURL(i.url)); images=[]; render(); $("downloadLink").classList.add("hidden"); });
  $("quality").addEventListener("change", updateSummary);
  $("fileName").addEventListener("input", () => { $("downloadLink").classList.add("hidden"); });
  $("generateButton").addEventListener("click", generatePDF);

  function loadImage(item, quality) {
    return new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Could not read ${item.file.name}`));
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          // Re-encode through canvas for consistent JPEG/WEBP support and controllable quality.
          const maxSide = 5000, scale = Math.min(1, maxSide / Math.max(img.naturalWidth,img.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1,Math.round(img.naturalWidth*scale)); canvas.height = Math.max(1,Math.round(img.naturalHeight*scale));
          const ctx = canvas.getContext("2d", {alpha:false});
          ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,canvas.width,canvas.height);
          resolve({data:canvas.toDataURL("image/jpeg",quality),width:canvas.width,height:canvas.height});
        };
        img.onerror = () => reject(new Error(`Invalid image: ${item.file.name}`)); img.src = reader.result;
      };
      reader.readAsDataURL(item.file);
    });
  }
  async function generatePDF() {
    if (!images.length) return;
    if (!window.jspdf || !window.jspdf.jsPDF) { showToast("PDF library did not load. Check your internet connection and refresh."); return; }
    const button = generateButton, original = button.innerHTML;
    button.disabled = true; button.querySelector("span").textContent = "Preparing PDF…";
    $("downloadLink").classList.add("hidden");
    try {
      const {jsPDF} = window.jspdf;
      const pageSize = $("pageSize").value, orientationChoice = $("orientation").value;
      const margin = Number($("margin").value), fitMode = $("fitMode").value, quality = Number($("quality").value);
      let pdf = null;
      for (let i=0;i<images.length;i++) {
        $("statusMessage").textContent = `Preparing page ${i+1} of ${images.length}…`;
        const image = await loadImage(images[i],quality);
        let format = pageSize === "image" ? [image.width*0.264583,image.height*0.264583] : pageSize;
        let orientation = orientationChoice === "auto" ? (image.width > image.height ? "landscape" : "portrait") : orientationChoice;
        if (pageSize === "image") orientation = image.width > image.height ? "landscape" : "portrait";
        if (!pdf) pdf = new jsPDF({orientation,unit:"mm",format,compress:true});
        else {
          if (pageSize === "image") format = [image.width*0.264583,image.height*0.264583];
          pdf.addPage(format,orientation);
        }
        const pageW = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight();
        const usableW = Math.max(1,pageW-margin*2), usableH = Math.max(1,pageH-margin*2);
        let drawW = image.width*0.264583, drawH = image.height*0.264583, x = margin, y = margin;
        if (fitMode === "fit") {
          const scale = Math.min(usableW/drawW,usableH/drawH);
          drawW *= scale; drawH *= scale; x = (pageW-drawW)/2; y = (pageH-drawH)/2;
        } else if (fitMode === "fill") {
          const scale = Math.max(usableW/drawW,usableH/drawH);
          drawW *= scale; drawH *= scale; x = (pageW-drawW)/2; y = (pageH-drawH)/2;
        } else {
          const scale = Math.min(1,usableW/drawW,usableH/drawH);
          drawW *= scale; drawH *= scale; x = margin; y = margin;
        }
        pdf.addImage(image.data,"JPEG",x,y,drawW,drawH,undefined,"FAST");
        await new Promise(r=>setTimeout(r,0));
      }
      const filename = `${safeName($("fileName").value)}.pdf`;
      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      const link = $("downloadLink"); link.href=url; link.download=filename; link.textContent=`Download ${filename} ↓`; link.classList.remove("hidden");
      // Use a real anchor click for broad mobile browser compatibility.
      link.click();
      $("statusMessage").textContent = `Done — ${images.length} page${images.length===1?"":"s"} created (${formatBytes(blob.size)}).`;
      showToast("Your PDF is ready!");
    } catch (error) {
      console.error(error); $("statusMessage").textContent = "PDF could not be created. Try fewer or smaller images.";
      showToast(error.message || "Something went wrong while creating the PDF.");
    } finally { button.disabled = images.length===0; button.innerHTML = original; }
  }

  $("themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    $("themeIcon").textContent = document.body.classList.contains("dark") ? "☀" : "☾";
  });
  $("year").textContent = new Date().getFullYear();
  updateSummary();
})();