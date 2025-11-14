const analyzeBtn = document.getElementById("analyzeBtn");
const adTextInput = document.getElementById("adText");
const goalSelect = document.getElementById("goalSelect");
const errorMsg = document.getElementById("errorMsg");

const resultsCard = document.getElementById("resultsCard");
const scoreValue = document.getElementById("scoreValue");
const goalDisplay = document.getElementById("goalDisplay");
const aiSummaryText = document.getElementById("aiSummaryText");
const breakdownList = document.getElementById("breakdownList");
const suggestionsList = document.getElementById("suggestionsList");

const imageInput = document.getElementById("imageInput");
const imagePreviewWrapper = document.getElementById("imagePreviewWrapper");
const imagePreview = document.getElementById("imagePreview");

const modeToggle = document.getElementById("modeToggle");
const modeLabel = document.getElementById("modeLabel");

// Initial state = Text mode
setTextMode(true);

modeToggle.addEventListener("change", () => {
  if (modeToggle.checked) {
    // Image Mode
    setImageMode(true);
  } else {
    // Text Mode
    setTextMode(true);
  }
});

function setTextMode(active) {
  if (!active) return;

  modeLabel.textContent = "Text Mode";

  adTextInput.disabled = false;
  adTextInput.style.opacity = "1";

  imageInput.disabled = true;
  imageInput.value = "";
  imageInput.style.opacity = "0.4";
}

function setImageMode(active) {
  if (!active) return;

  modeLabel.textContent = "Image Mode";

  adTextInput.disabled = true;
  adTextInput.value = "";
  adTextInput.style.opacity = "0.4";

  imageInput.disabled = false;
  imageInput.style.opacity = "1";
}

// we'll store the currently selected file here for later
let selectedImageFile = null;

const rewriteText = document.getElementById("rewriteText");
analyzeBtn.addEventListener("click", async () => {
  const adText = adTextInput.value.trim();
  const file = imageInput.files[0];
  const goal = goalSelect.value;

  // Mode check
  if (!modeToggle.checked) {
    // TEXT MODE
    if (!adText) {
      showError("Please enter ad text.");
      return;
    }
  } else {
    // IMAGE MODE
    if (!file) {
      showError("Please upload an image.");
      return;
    }
  }

  hideError();

  try {
    const formData = new FormData();
    formData.append("goal", goal);

    // Add correct field based on mode
    if (!modeToggle.checked) {
      // TEXT mode
      formData.append("adText", adText);
    } else {
      // IMAGE mode
      formData.append("imageFile", file);
    }

    const response = await fetch("/analyzeAd", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      showError("Server error. Check if 'npm start' is running.");
      return;
    }

    const data = await response.json();

    if (data.error) {
      showError(data.error);
      return;
    }

    renderResults(data);

  } catch (err) {
    console.error(err);
    showError("Could not connect to backend.");
  }
});



function renderResults(data) {
  // unhide results card
  resultsCard.style.display = "block";

  // main score
  scoreValue.textContent = data.score ?? "--";

  // 🟢 Add this block right after displaying main score:
  if (data.improvedScore != null) {
    const improved = document.createElement("p");
    improved.textContent = `AI version score: ${data.improvedScore} / 100`;
    improved.style.fontSize = "0.8rem";
    improved.style.color = "#22c55e";
    improved.style.marginTop = "4px";
    scoreValue.parentNode.appendChild(improved);
  }

  // goal
  goalDisplay.textContent = data.goalAnalyzed ?? "--";

  // AI summary paragraph
  aiSummaryText.textContent = data.aiSummary || "No summary generated.";
  
  // rewrite suggestion
  rewriteText.textContent = data.rewrite || "No rewrite generated.";

  // breakdown (object like { CTA: 50, Urgency: 100, Curiosity: 0 })
  breakdownList.innerHTML = ""; // clear previous
  if (data.breakdown) {
    Object.entries(data.breakdown).forEach(([key, val]) => {
      const item = document.createElement("div");
      item.className = "breakdown-item";

      const k = document.createElement("div");
      k.className = "breakdown-key";
      k.textContent = key;

      const v = document.createElement("div");
      v.className = "breakdown-val";
      v.textContent = val + " / 100";

      item.appendChild(k);
      item.appendChild(v);
      breakdownList.appendChild(item);
    });
  }

  // suggestions array
  suggestionsList.innerHTML = "";
  if (Array.isArray(data.suggestions)) {
    data.suggestions.forEach(s => {
      const li = document.createElement("li");
      li.textContent = s;
      suggestionsList.appendChild(li);
    });
  }
}


function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = "block";
}

function hideError() {
  errorMsg.style.display = "none";
}

// Image logic
imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];

  if (!file) {
    selectedImageFile = null;
    imagePreviewWrapper.style.display = "none";
    imagePreview.src = "";
    return;
  }

  // basic guard: only images
  if (!file.type.startsWith("image/")) {
    alert("Please upload an image file (PNG, JPG, etc.).");
    imageInput.value = "";
    selectedImageFile = null;
    imagePreviewWrapper.style.display = "none";
    imagePreview.src = "";
    return;
  }

  selectedImageFile = file;

  // show preview
  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreview.src = e.target.result;
    imagePreviewWrapper.style.display = "block";
  };
  reader.readAsDataURL(file);
});
