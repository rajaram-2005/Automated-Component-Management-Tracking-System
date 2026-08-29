"use strict";

/* ==========================================================================
   Compound Management System — dashboard controller
   Talks to the Spring Boot REST API: CRUD, NLP search, AI classification,
   recommendations, analytics overview, audit log. The component editor is a
   four-step wizard with a live stock-risk meter mirroring the backend
   forecast formula.
   ========================================================================== */

const state = {
    allComponents: [],
    components: [],
    editingId: null,
    activeQuery: "",
    filters: { domain: "", region: "", risk: "" },
    lastDomainDistribution: {},
    wizard: { step: 1, busy: false }
};

const els = {};

const DONUT_COLORS = {
    ECE: "#a78bfa",
    EEE: "#fbbf24",
    MECHANICAL: "#2dd4bf"
};

const STEP_LABELS = ["Identity", "Classification", "Inventory", "Review"];
const TOTAL_STEPS = 4;

document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    applySavedTheme();
    bindEvents();
    initScrollAssist();
    showTableSkeleton();
    initCommandPalette();
    refreshAll();
    loadAuditLog();
});

function cacheElements() {
    const ids = [
        // wizard
        "componentWizard", "wizardOverlay", "wizardCloseBtn", "componentForm", "formTitle", "wizardSubtitle",
        "wizardBackBtn", "wizardNextBtn", "wizardStepInfo", "wizardProgress", "wizardReview", "saveBtn", "clearBtn",
        "componentId", "componentCode", "name", "nameError", "category", "subCategory", "region", "manufacturer",
        "specifications", "quantity", "minimumStockLevel", "monthlyDemand", "leadTimeDays", "unitPrice",
        "classifyBtn", "classificationResult", "riskScore", "riskMarker", "daysToStockout",
        "availabilityPreview", "stockValuePreview", "riskNarrative",
        // dashboard
        "newComponentBtn", "componentTableBody", "searchQuery", "searchSummary", "recommendationSummary",
        "recommendationList", "domainDistribution", "regionDistribution", "riskList",
        "analyticsInsights", "searchBtn", "resetBtn", "aiRecommendBtn",
        "toast", "toastMessage", "toastClose", "totalComponents", "totalUnits", "lowStockComponents",
        "averageAvailability", "themeToggle", "commandOpenBtn", "commandInlineBtn", "exportBtn",
        "filterDomain", "filterRegion", "filterRisk", "catalogCount", "domainDonut", "donutLegend",
        "auditList", "auditRefreshBtn", "commandPalette", "commandOverlay", "commandInput",
        "commandCloseBtn", "commandResults",
        "scrollUpBtn", "scrollDownBtn", "scrollProgress"
    ];

    ids.forEach((id) => {
        const node = document.getElementById(id);
        if (node) {
            els[id] = node;
        }
    });
}

function bindEvents() {
    els.componentForm.addEventListener("submit", handleSubmit);
    els.clearBtn.addEventListener("click", () => resetWizardFields());
    els.classifyBtn.addEventListener("click", () => runClassification(true));
    els.searchBtn.addEventListener("click", runSearch);
    els.resetBtn.addEventListener("click", resetSearch);
    els.aiRecommendBtn.addEventListener("click", runQueryRecommendations);
    els.exportBtn.addEventListener("click", exportCsv);
    els.auditRefreshBtn.addEventListener("click", loadAuditLog);
    els.toastClose.addEventListener("click", () => {
        els.toast.className = "toast hidden";
    });

    els.newComponentBtn.addEventListener("click", () => openWizard());

    els.wizardCloseBtn.addEventListener("click", closeWizard);
    els.wizardOverlay.addEventListener("click", closeWizard);
    els.wizardBackBtn.addEventListener("click", () => goToStep(state.wizard.step - 1));
    els.wizardNextBtn.addEventListener("click", () => {
        if (validateStep(state.wizard.step)) {
            goToStep(state.wizard.step + 1);
        }
    });

    document.querySelectorAll(".wstep").forEach((button) => {
        button.addEventListener("click", () => {
            const target = Number(button.dataset.step);
            if (target > state.wizard.step && !validateStep(state.wizard.step)) {
                return;
            }
            goToStep(target);
        });
    });

    els.searchQuery.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            runSearch();
        }
    });

    ["quantity", "minimumStockLevel", "monthlyDemand", "leadTimeDays", "unitPrice"].forEach((id) => {
        els[id].addEventListener("input", () => updateRiskMeter());
    });

    ["name", "specifications", "category"].forEach((id) => {
        els[id].addEventListener("input", () => {
            debounceClassification();
            if (id === "name") {
                els.nameError.hidden = true;
                els.name.classList.remove("invalid");
            }
        });
    });

    els.filterDomain.addEventListener("change", () => applyFilters());
    els.filterRegion.addEventListener("change", () => applyFilters());
    els.filterRisk.addEventListener("change", () => applyFilters());

    els.themeToggle.addEventListener("click", toggleTheme);
    els.commandOpenBtn.addEventListener("click", openCommandPalette);
    els.commandInlineBtn.addEventListener("click", openCommandPalette);

    document.querySelectorAll(".sample-query").forEach((button) => {
        button.addEventListener("click", () => {
            els.searchQuery.value = button.dataset.query || "";
            runSearch();
        });
    });

    els.componentTableBody.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) {
            return;
        }

        if (button.dataset.action === "new") {
            openWizard();
            return;
        }

        const id = Number(button.dataset.id);
        const action = button.dataset.action;
        const component = state.components.find((item) => item.id === id);
        if (!component) {
            return;
        }

        if (action === "edit") {
            openWizard(component);
        }

        if (action === "delete") {
            await deleteComponent(component);
        }

        if (action === "recommend") {
            await showComponentRecommendations(component.id, component.name);
        }
    });

    document.addEventListener("keydown", (event) => {
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");

        if (event.key === "Escape") {
            if (!els.componentWizard.classList.contains("hidden")) {
                closeWizard();
            } else if (!els.commandPalette.classList.contains("hidden")) {
                closeCommandPalette();
            }
            return;
        }

        if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "n") {
            if (els.componentWizard.classList.contains("hidden") && els.commandPalette.classList.contains("hidden")) {
                event.preventDefault();
                openWizard();
            }
        }
    });
}

/* --------------------------- Scroll assist ------------------------------- */

/*
 * One passive, rAF-batched scroll listener drives everything scroll-related:
 * the top progress line, the ↓/↑ floating buttons, and the compact sticky
 * topbar state. No layout reads are forced outside the frame (scrollHeight /
 * clientHeight are cheap cached reads; only transform + classes are written),
 * and everything respects prefers-reduced-motion.
 */

function initScrollAssist() {
    if (!els.scrollUpBtn || !els.scrollDownBtn) {
        return;
    }

    const topbar = document.querySelector(".topbar");
    const reduceMotion = typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior = reduceMotion ? "auto" : "smooth";
    let ticking = false;

    function maxScroll() {
        const doc = document.documentElement;
        const viewport = window.innerHeight || doc.clientHeight || 0;
        return Math.max((doc.scrollHeight || 0) - viewport, 0);
    }

    function update() {
        ticking = false;
        const y = window.scrollY || window.pageYOffset || 0;
        const max = maxScroll();
        const progress = max > 0 ? Math.min(y / max, 1) : 0;

        els.scrollUpBtn.classList.toggle("show", y > 420);
        els.scrollDownBtn.classList.toggle("show", max > 0 && y < max - 220);

        if (els.scrollProgress) {
            els.scrollProgress.style.transform = `scaleX(${progress.toFixed(4)})`;
        }
        if (topbar) {
            topbar.classList.toggle("scrolled", y > 8);
        }
    }

    function scheduleUpdate() {
        if (!ticking) {
            ticking = true;
            window.requestAnimationFrame(update);
        }
    }

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });

    els.scrollUpBtn.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior });
    });

    els.scrollDownBtn.addEventListener("click", () => {
        const viewport = window.innerHeight || document.documentElement.clientHeight || 800;
        const y = window.scrollY || window.pageYOffset || 0;
        window.scrollTo({ top: Math.min(y + Math.round(viewport * 0.85), maxScroll()), behavior });
    });

    // Data loads swap skeletons for content and change page height; keep the
    // down-button visibility accurate without polling the scroll position.
    if (typeof ResizeObserver === "function") {
        new ResizeObserver(scheduleUpdate).observe(document.body);
    }

    update();
}

/* ---------------------------- Theme ------------------------------------- */

function applySavedTheme() {
    const stored = localStorage.getItem("cms-theme");
    const theme = stored === "light" ? "light" : "dark";
    setTheme(theme);
}

function toggleTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("cms-theme", next);
    drawDonut(state.lastDomainDistribution);
}

function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const icon = els.themeToggle.querySelector(".theme-icon");
    const label = els.themeToggle.querySelector(".theme-label");
    if (icon) {
        icon.textContent = theme === "light" ? "☀️" : "🌙";
    }
    if (label) {
        label.textContent = theme === "light" ? "Light" : "Dark";
    }
}

/* --------------------------- Data loading -------------------------------- */

async function refreshAll() {
    await Promise.all([loadComponents(), loadAnalytics()]);
}

async function loadComponents() {
    state.allComponents = await api("/api/components");
    state.components = state.allComponents;
    renderComponents(state.components);
}

async function loadAnalytics() {
    const overview = await api("/api/analytics/overview");
    renderAnalytics(overview);
}

async function loadAuditLog() {
    if (!els.auditList) {
        return;
    }
    els.auditList.innerHTML = `<p class="muted">Loading recent activity…</p>`;
    try {
        const rows = await api("/api/audit/recent?limit=15");
        renderAuditLog(rows);
    } catch (error) {
        els.auditList.innerHTML = `<p class="muted">Unable to load activity log.</p>`;
    }
}

function renderAuditLog(rows) {
    if (!els.auditList) {
        return;
    }
    if (!rows || !rows.length) {
        els.auditList.innerHTML = `<p class="muted">No recorded activity yet.</p>`;
        return;
    }

    els.auditList.innerHTML = rows.map((row) => `
        <div class="audit-row">
            <span class="audit-action ${escapeHtml((row.action || "update").toLowerCase())}">${escapeHtml(row.action)}</span>
            <div class="audit-meta">
                <div class="component-name">${escapeHtml(row.summary)}</div>
                <div class="component-meta">${escapeHtml(row.username)} · ${escapeHtml(row.entityType)}</div>
            </div>
            <div class="audit-time">${formatDate(row.timestamp)}</div>
        </div>`).join("");
}

/* ------------------------------ Filters ----------------------------------- */

function applyFilters() {
    const domain = els.filterDomain.value;
    const region = els.filterRegion.value;
    const risk = els.filterRisk.value;
    state.filters = { domain, region, risk };
    renderComponents(state.components);
}

function filterComponents(list) {
    const { domain, region, risk } = state.filters;
    return list.filter((component) => {
        if (domain && (component.discipline || "").toUpperCase() !== domain.toUpperCase()) {
            return false;
        }
        if (region && (component.region || "").toLowerCase() !== region.toLowerCase()) {
            return false;
        }
        if (risk && (component.stockRisk || "").toUpperCase() !== risk.toUpperCase()) {
            return false;
        }
        return true;
    });
}

/* ---------------------------- Rendering ----------------------------------- */

function disciplineRowClass(discipline) {
    const key = String(discipline || "").toUpperCase();
    if (key === "ECE") return "row-ece";
    if (key === "EEE") return "row-eee";
    if (key === "MECHANICAL") return "row-mechanical";
    return "";
}

function disciplineChip(discipline) {
    const key = String(discipline || "").toUpperCase();
    const cls = key === "ECE" ? "chip-ece" : key === "EEE" ? "chip-eee" : key === "MECHANICAL" ? "chip-mechanical" : "chip-auto";
    return `<span class="chip ${cls}">${escapeHtml(key || "UNSET")}</span>`;
}

function stockBar(component) {
    const min = Math.max(component.minimumStockLevel || 0, 1);
    const ideal = Math.max(min * 3, 1);
    const ratio = Math.min(component.quantity / ideal, 1);
    const pct = Math.round(ratio * 100);
    const tone = ratio >= 0.66 ? "" : ratio >= 0.33 ? "warn" : "bad";
    return `
        <div class="stock-cell">
            <div>${component.quantity} units</div>
            <div class="stock-track"><div class="stock-fill ${tone}" style="width:${pct}%"></div></div>
            <div class="component-meta">Min ${component.minimumStockLevel} · Demand ${Number(component.monthlyDemand).toFixed(1)}/mo</div>
        </div>`;
}

function renderComponents(components) {
    if (!els.componentTableBody) {
        return;
    }

    const filtered = filterComponents(components);
    if (els.catalogCount) {
        els.catalogCount.textContent = `${filtered.length} of ${components.length} shown`;
    }

    if (!filtered.length) {
        if (!components.length) {
            els.componentTableBody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="empty-state">
                            <span class="empty-icon" aria-hidden="true">🧩</span>
                            <strong>No components in the catalog yet</strong>
                            <p>Launch the new guided form to register your first EEE, ECE, or Mechanical component.</p>
                            <button type="button" class="primary-btn" data-action="new">＋ Open the new component form</button>
                        </div>
                    </td>
                </tr>`;
            return;
        }
        els.componentTableBody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="empty-state">
                        <span class="empty-icon" aria-hidden="true">🔭</span>
                        <strong>Nothing matched</strong>
                        <p>No components match the current search or filters. Try widening the domain, region, or risk filters.</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    els.componentTableBody.innerHTML = filtered.map((component) => {
        const scoreMarkup = component.searchScore
            ? `<div class="score-chip">Search score ${Number(component.searchScore).toFixed(1)}</div>`
            : "";

        const reasonMarkup = Array.isArray(component.searchReasons) && component.searchReasons.length
            ? `<div class="reason-list">${component.searchReasons.slice(0, 3).map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")}</div>`
            : "";

        const editingClass = state.editingId === component.id ? "row-editing" : "";

        return `
            <tr class="${disciplineRowClass(component.discipline)} ${editingClass}">
                <td>
                    <div class="component-name">${escapeHtml(component.name)}</div>
                    <div class="component-meta">${escapeHtml(component.componentCode)} · ${escapeHtml(component.manufacturer || "Independent Supplier")}</div>
                    ${scoreMarkup}
                    ${reasonMarkup}
                </td>
                <td>${disciplineChip(component.discipline)}</td>
                <td>
                    <div>${escapeHtml(component.category || "General")}</div>
                    <div class="component-meta">${escapeHtml(component.subCategory || "General sub-category")}</div>
                </td>
                <td>${escapeHtml(component.region || "-")}</td>
                <td>${stockBar(component)}</td>
                <td>
                    <span class="badge ${riskClass(component.stockRisk)}">${escapeHtml(component.stockRisk || "LOW")}</span>
                    <div class="component-meta">${Number(component.availabilityProbability || 0).toFixed(1)}% confidence · ${Number(component.predictedDaysToStockout || 0).toFixed(1)} days</div>
                </td>
                <td>
                    <div class="table-actions">
                        <button type="button" class="secondary-btn" data-action="edit" data-id="${component.id}">✏️ Edit</button>
                        <button type="button" class="ghost-btn" data-action="recommend" data-id="${component.id}">✨ Suggest</button>
                        <button type="button" class="danger-btn" data-action="delete" data-id="${component.id}">🗑</button>
                    </div>
                </td>
            </tr>`;
    }).join("");
}

function renderAnalytics(overview) {
    animateCount(els.totalComponents, overview.totalComponents);
    animateCount(els.totalUnits, overview.totalUnits);
    animateCount(els.lowStockComponents, overview.lowStockComponents);
    if (els.averageAvailability) {
        animateCount(els.averageAvailability, overview.averageAvailabilityProbability, "%");
    }

    els.domainDistribution.innerHTML = renderDistributionBars(overview.domainDistribution);
    els.regionDistribution.innerHTML = renderDistributionBars(overview.regionDistribution);

    state.lastDomainDistribution = overview.domainDistribution || {};
    drawDonut(state.lastDomainDistribution);

    els.riskList.innerHTML = overview.atRiskComponents.map((item) => `
        <div class="metric-card">
            <div class="component-name">${escapeHtml(item.name)}</div>
            <div class="component-meta">${escapeHtml(item.componentCode)} · ${disciplineChip(item.discipline)}</div>
            <div class="reason-list">
                <span>⏳ ${Number(item.predictedDaysToStockout).toFixed(1)} days to stockout</span>
                <span>🎯 ${Number(item.availabilityProbability).toFixed(1)}% availability</span>
                <span class="badge ${riskClass(item.stockRisk)}">${escapeHtml(item.stockRisk)}</span>
            </div>
        </div>`).join("") || `<div class="muted">No at-risk components detected. 🎉</div>`;

    els.analyticsInsights.innerHTML = overview.keyInsights.map((insight) => `<li>${escapeHtml(insight)}</li>`).join("");
}

function renderDistributionBars(distribution) {
    const entries = Object.entries(distribution || {});
    if (!entries.length) {
        return `<div class="muted">No data available.</div>`;
    }

    const maxValue = Math.max(...entries.map(([, value]) => value), 1);
    return entries.map(([label, value]) => `
        <div class="distribution-bar">
            <div class="component-meta">${escapeHtml(label)} · ${value}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${(value / maxValue) * 100}%"></div></div>
        </div>`).join("");
}

function drawDonut(distribution) {
    if (!els.domainDonut) {
        return;
    }
    const canvas = els.domainDonut;
    const entries = Object.entries(distribution || {}).filter(([, value]) => value > 0);
    const total = entries.reduce((sum, [, value]) => sum + value, 0);

    if (!entries.length || !total || typeof canvas.getContext !== "function") {
        if (els.donutLegend) {
            els.donutLegend.innerHTML = `<div class="muted">No data available.</div>`;
        }
        return;
    }

    const ctx = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    if (els.donutLegend) {
        els.donutLegend.innerHTML = entries.map(([label, value]) => `
            <div class="legend-row">
                <span class="legend-swatch" style="background:${DONUT_COLORS[label] || "#8b5cf6"};color:${DONUT_COLORS[label] || "#8b5cf6"}"></span>
                <span>${escapeHtml(label)}</span>
                <span style="margin-left:auto">${value}</span>
            </div>`).join("");
    }

    if (!ctx) {
        return;
    }

    const radius = Math.min(centerX, centerY) - 8;
    const thickness = 20;
    ctx.clearRect(0, 0, width, height);

    const theme = document.documentElement.getAttribute("data-theme");
    const textColor = theme === "light" ? "#1c1440" : "#f6f4ff";

    let startAngle = -Math.PI / 2;
    entries.forEach(([label, value]) => {
        const sliceAngle = (value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.arc(centerX, centerY, radius - thickness, startAngle + sliceAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = DONUT_COLORS[label] || "#8b5cf6";
        ctx.fill();
        startAngle += sliceAngle;
    });

    ctx.fillStyle = textColor;
    ctx.font = "700 28px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${total}`, centerX, centerY - 6);
    ctx.font = "400 12px Inter, system-ui, sans-serif";
    ctx.fillStyle = theme === "light" ? "#6b6394" : "#b6b1d6";
    ctx.fillText("components", centerX, centerY + 16);
}

function renderRecommendations(response) {
    els.recommendationSummary.textContent = response.summary;
    if (!response.recommendations.length) {
        els.recommendationList.innerHTML = `<div class="muted">No recommendation candidates available for the current context.</div>`;
        return;
    }

    els.recommendationList.innerHTML = response.recommendations.map((item) => `
        <div class="recommendation-card">
            <div class="component-name">${escapeHtml(item.component.name)}</div>
            <div class="component-meta">${escapeHtml(item.component.componentCode)} · ${escapeHtml(item.component.category || "General")} · ${escapeHtml(item.component.region || "-")}</div>
            <div class="reason-list">
                <span>Score ${Number(item.score).toFixed(1)}</span>
                <span>${Number(item.component.availabilityProbability).toFixed(1)}% availability</span>
                <span class="badge ${riskClass(item.component.stockRisk)}">${escapeHtml(item.component.stockRisk)}</span>
            </div>
            <div class="reason-list">${item.reasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")}</div>
        </div>`).join("");
}

/* ==========================================================================
   THE NEW FORM — wizard mechanics
   ========================================================================== */

function openWizard(component) {
    resetWizardFields();
    if (component) {
        state.editingId = component.id;
        els.componentId.value = component.id;
        els.componentCode.value = component.componentCode || "";
        els.name.value = component.name || "";
        setDiscipline(component.discipline || "");
        els.category.value = component.category || "";
        els.subCategory.value = component.subCategory || "";
        els.region.value = component.region || "Asia-Pacific";
        els.manufacturer.value = component.manufacturer || "";
        els.specifications.value = component.specifications || "";
        els.quantity.value = component.quantity ?? 0;
        els.minimumStockLevel.value = component.minimumStockLevel ?? 0;
        els.monthlyDemand.value = component.monthlyDemand ?? 0;
        els.leadTimeDays.value = component.leadTimeDays ?? 0;
        els.unitPrice.value = component.unitPrice ?? 0;
        els.formTitle.innerHTML = `Editing <span class="grad-text">${escapeHtml(component.name)}</span>`;
        els.saveBtn.textContent = "💾 Update Component";
    } else {
        state.editingId = null;
        els.formTitle.textContent = "Register New Component";
        els.saveBtn.textContent = "💾 Save Component";
    }

    els.componentWizard.classList.remove("hidden");
    document.body.classList.add("wizard-open");
    renderComponents(state.components);
    goToStep(1, true);
    updateRiskMeter();
    window.setTimeout(() => els.name.focus(), 60);
}

function closeWizard() {
    els.componentWizard.classList.add("hidden");
    document.body.classList.remove("wizard-open");
    state.editingId = null;
    renderComponents(state.components);
}

function resetWizardFields() {
    state.editingId = null;
    els.componentForm.reset();
    els.componentId.value = "";
    els.region.value = "Asia-Pacific";
    setDiscipline("");
    els.formTitle.textContent = "Register New Component";
    els.saveBtn.textContent = "💾 Save Component";
    els.nameError.hidden = true;
    els.name.classList.remove("invalid");
    if (els.classificationResult) {
        els.classificationResult.innerHTML = `<p class="muted" style="margin:0">Predictions appear here as you type — they auto-fill empty fields.</p>`;
    }
}

function goToStep(step, silent) {
    const clamped = Math.min(Math.max(step, 1), TOTAL_STEPS);
    state.wizard.step = clamped;

    document.querySelectorAll(".wizard-step").forEach((section) => {
        section.classList.toggle("active", Number(section.dataset.step) === clamped);
    });

    document.querySelectorAll(".wstep").forEach((button) => {
        const target = Number(button.dataset.step);
        button.classList.toggle("active", target === clamped);
        button.classList.toggle("done", target < clamped);
    });

    els.wizardStepInfo.textContent = `Step ${clamped} of ${TOTAL_STEPS} — ${STEP_LABELS[clamped - 1]}`;
    els.wizardProgress.style.width = `${(clamped / TOTAL_STEPS) * 100}%`;
    els.wizardBackBtn.disabled = clamped === 1;
    els.wizardNextBtn.hidden = clamped === TOTAL_STEPS;
    els.saveBtn.hidden = clamped !== TOTAL_STEPS;

    if (clamped === TOTAL_STEPS) {
        renderReview();
    }
    if (clamped === 3) {
        updateRiskMeter();
    }

    if (!silent) {
        els.componentWizard.querySelector(".wizard-body").scrollTop = 0;
    }
}

function validateStep(step) {
    if (step === 1) {
        const name = els.name.value.trim();
        if (name.length < 3) {
            els.nameError.hidden = false;
            els.name.classList.add("invalid");
            goToStep(1);
            els.name.focus();
            showToast("Component name needs at least 3 characters.", true);
            return false;
        }
        els.nameError.hidden = true;
        els.name.classList.remove("invalid");
    }

    if (step === 3) {
        const numericFields = ["quantity", "minimumStockLevel", "monthlyDemand", "leadTimeDays", "unitPrice"];
        let valid = true;
        numericFields.forEach((id) => {
            const raw = els[id].value.trim();
            const parsed = Number(raw);
            const bad = raw === "" || !Number.isFinite(parsed) || parsed < 0;
            els[id].classList.toggle("invalid", bad);
            if (bad) {
                valid = false;
            }
        });
        if (!valid) {
            showToast("All inventory numbers must be 0 or greater.", true);
            return false;
        }
    }
    return true;
}

function getDiscipline() {
    const checked = document.querySelector('input[name="discipline"]:checked');
    return checked ? checked.value : "";
}

function setDiscipline(value) {
    const wanted = String(value || "").toUpperCase();
    const radios = document.querySelectorAll('input[name="discipline"]');
    const match = Array.from(radios).find((radio) => radio.value === wanted);
    (match || radios[0]).checked = true;
}

/* --------------------- Live AI classification in the form --------------- */

let classifyTimer = null;

function debounceClassification() {
    window.clearTimeout(classifyTimer);
    const hasName = els.name.value.trim().length >= 3;
    const hasSpecs = els.specifications.value.trim().length >= 12;
    if (!hasName && !hasSpecs) {
        return;
    }
    classifyTimer = window.setTimeout(() => runClassification(false), 750);
}

async function runClassification(manual) {
    const name = els.name.value.trim();
    const specifications = els.specifications.value.trim();
    const categoryHint = els.category.value.trim();

    if (!name && !specifications) {
        if (manual) {
            showToast("Enter a component name or specifications first.", true);
        }
        return;
    }

    try {
        const response = await api("/api/ai/classify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, specifications, categoryHint })
        });

        renderClassification(response);

        if (!getDiscipline()) {
            setDiscipline(response.discipline);
        }
        if (!els.category.value.trim()) {
            els.category.value = response.category || "";
        }
    } catch (error) {
        if (manual) {
            showToast(error.message || "Classification failed.", true);
        }
    }
}

function renderClassification(response) {
    const confidence = Number(response.confidence || 0);
    els.classificationResult.innerHTML = `
        <div class="metric-card">
            <div class="component-name">🪄 ${escapeHtml(response.summary)}</div>
            <div class="reason-list">
                <span class="chip ${chipForDiscipline(response.discipline)}">${escapeHtml(response.discipline)}</span>
                <span>${escapeHtml(response.category)}</span>
                <span>${confidence.toFixed(1)}% confidence</span>
            </div>
            <div class="class-confidence">
                <div class="confidence-track"><div class="confidence-fill" style="width:${Math.min(confidence, 100)}%"></div></div>
            </div>
            <div class="reason-list">${(response.matchedSignals || []).map((signal) => `<span>${escapeHtml(signal)}</span>`).join("")}</div>
        </div>`;
}

function chipForDiscipline(discipline) {
    const key = String(discipline || "").toUpperCase();
    if (key === "ECE") return "chip-ece";
    if (key === "EEE") return "chip-eee";
    if (key === "MECHANICAL") return "chip-mechanical";
    return "chip-auto";
}

/* ----------------------- Live stock-risk forecast meter ------------------ */

function num(id) {
    const parsed = Number(els[id].value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function draftForecast() {
    const quantity = Math.max(num("quantity"), 0);
    const minimum = Math.max(num("minimumStockLevel"), 0);
    const demand = Math.max(num("monthlyDemand"), 0);
    const lead = Math.max(num("leadTimeDays"), 0);
    const price = Math.max(num("unitPrice"), 0);

    // Mirrors AnalyticsService.forecast() so the preview matches the server.
    const demandNorm = Math.max(demand, 0.1);
    const daysToStockout = quantity <= 0 ? 0 : (quantity / demandNorm) * 30.0;
    const projected = quantity - demandNorm * (lead / 30.0);
    const bufferRatio = (projected - minimum) / Math.max(minimum, 1);
    const probability = clamp((1 / (1 + Math.exp(-bufferRatio))) * 85.0 + 10.0, 5.0, 99.0);

    let risk = "LOW";
    if (quantity <= Math.max(1, minimum / 2) || daysToStockout <= lead) {
        risk = "CRITICAL";
    } else if (quantity <= minimum || daysToStockout <= lead + 30) {
        risk = "HIGH";
    } else if (daysToStockout <= 90) {
        risk = "MODERATE";
    }

    const narratives = {
        CRITICAL: "Projected depletion is inside supplier lead time. Trigger replenishment immediately.",
        HIGH: "Stock is vulnerable to near-term demand spikes. Plan replenishment soon.",
        MODERATE: "Coverage is acceptable but should be observed against monthly demand.",
        LOW: "Healthy coverage and low immediate replenishment pressure."
    };

    return {
        risk,
        probability: Math.round(probability * 10) / 10,
        daysToStockout: Math.round(daysToStockout * 10) / 10,
        stockValue: Math.round(quantity * price * 100) / 100,
        narrative: narratives[risk]
    };
}

function updateRiskMeter() {
    if (!els.riskMarker || !els.riskScore) {
        return;
    }
    const forecast = draftForecast();

    els.riskScore.innerHTML = `<span class="badge ${forecast.risk.toLowerCase()}">${forecast.risk}</span>`;
    els.daysToStockout.textContent = `${forecast.daysToStockout.toFixed(1)} days to stockout`;
    els.availabilityPreview.textContent = `${forecast.probability.toFixed(1)}% availability confidence`;
    els.stockValuePreview.textContent = `Stock value $${forecast.stockValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    els.riskNarrative.textContent = forecast.narrative;

    const markerPct = clamp(100 - forecast.probability, 2, 97);
    els.riskMarker.style.left = `${markerPct}%`;

    document.querySelectorAll(".meter-zone").forEach((zone) => {
        zone.classList.toggle("lit", zone.dataset.zone === forecast.risk);
    });
}

/* ------------------------------ Review step ------------------------------ */

function renderReview() {
    const forecast = draftForecast();
    const discipline = getDiscipline() || "Auto-detect 🤖";

    const row = (label, value) => `
        <div class="row"><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`;

    els.wizardReview.innerHTML = `
        <div class="review-card">
            <h4>🏷️ Identity &amp; sourcing</h4>
            <dl class="review-list">
                ${row("Name", `<span>${escapeHtml(els.name.value.trim() || "—")}</span>`)}
                ${row("Code", `<span>${escapeHtml(els.componentCode.value.trim() || "auto-generate on save")}</span>`)}
                ${row("Manufacturer", `<span>${escapeHtml(els.manufacturer.value.trim() || "—")}</span>`)}
                ${row("Region", `<span>${escapeHtml(els.region.value)}</span>`)}
            </dl>
        </div>
        <div class="review-card">
            <h4>🧠 Classification</h4>
            <dl class="review-list">
                ${row("Discipline", `<span class="chip ${chipForDiscipline(getDiscipline())}">${escapeHtml(discipline)}</span>`)}
                ${row("Category", `<span>${escapeHtml(els.category.value.trim() || "AI / General")}</span>`)}
                ${row("Sub-category", `<span>${escapeHtml(els.subCategory.value.trim() || "General")}</span>`)}
                ${row("Specifications", `<span>${escapeHtml(truncate(els.specifications.value.trim(), 80) || "—")}</span>`)}
            </dl>
        </div>
        <div class="review-card">
            <h4>📦 Inventory</h4>
            <dl class="review-list">
                ${row("Quantity", `<span>${num("quantity")} units</span>`)}
                ${row("Minimum stock", `<span>${num("minimumStockLevel")} units</span>`)}
                ${row("Monthly demand", `<span>${num("monthlyDemand")} / mo</span>`)}
                ${row("Lead time", `<span>${num("leadTimeDays")} days</span>`)}
                ${row("Unit price", `<span>$${num("unitPrice").toFixed(2)}</span>`)}
            </dl>
        </div>
        <div class="review-card">
            <h4>📈 Predicted analytics</h4>
            <dl class="review-list">
                ${row("Stock risk", `<span class="badge ${forecast.risk.toLowerCase()}">${forecast.risk}</span>`)}
                ${row("Days to stockout", `<span>${forecast.daysToStockout.toFixed(1)}</span>`)}
                ${row("Availability", `<span>${forecast.probability.toFixed(1)}%</span>`)}
                ${row("Stock value", `<span>$${forecast.stockValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>`)}
            </dl>
            <p class="review-note">${escapeHtml(forecast.narrative)}</p>
        </div>`;
}

/* ------------------------------ Submit flow ------------------------------ */

async function handleSubmit(event) {
    event.preventDefault();

    if (state.wizard.step < TOTAL_STEPS) {
        if (validateStep(state.wizard.step)) {
            goToStep(state.wizard.step + 1);
        }
        return;
    }

    if (state.wizard.busy) {
        return;
    }

    for (let step = 1; step <= 3; step += 1) {
        if (!validateStep(step)) {
            goToStep(step);
            return;
        }
    }

    const payload = {
        componentCode: els.componentCode.value.trim() || null,
        name: els.name.value.trim(),
        discipline: getDiscipline() || null,
        category: els.category.value.trim() || null,
        subCategory: els.subCategory.value.trim() || null,
        region: els.region.value.trim(),
        manufacturer: els.manufacturer.value.trim() || null,
        specifications: els.specifications.value.trim() || null,
        quantity: num("quantity"),
        minimumStockLevel: num("minimumStockLevel"),
        monthlyDemand: num("monthlyDemand"),
        leadTimeDays: num("leadTimeDays"),
        unitPrice: num("unitPrice")
    };

    const isEditing = Boolean(state.editingId);
    const url = isEditing ? `/api/components/${state.editingId}` : "/api/components";
    const method = isEditing ? "PUT" : "POST";

    state.wizard.busy = true;
    els.saveBtn.disabled = true;
    els.saveBtn.textContent = "Saving…";

    try {
        await api(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        closeWizard();
        showToast(isEditing ? "✨ Component updated successfully." : "🎉 Component created successfully.");
        await refreshAll();
        await loadAuditLog();
        if (state.activeQuery) {
            await runSearch();
        }
    } catch (error) {
        showToast(error.message || "Unable to save component.", true);
    } finally {
        state.wizard.busy = false;
        els.saveBtn.disabled = false;
        els.saveBtn.textContent = isEditing ? "💾 Update Component" : "💾 Save Component";
    }
}

async function deleteComponent(component) {
    const confirmed = window.confirm(`Delete ${component.name}? This action cannot be undone.`);
    if (!confirmed) {
        return;
    }

    try {
        await api(`/api/components/${component.id}`, { method: "DELETE" });
        showToast("Component deleted successfully.");
        if (!els.componentWizard.classList.contains("hidden") && state.editingId === component.id) {
            closeWizard();
        }
        await refreshAll();
        await loadAuditLog();
        if (state.activeQuery) {
            await runSearch();
        }
    } catch (error) {
        showToast(error.message || "Delete failed.", true);
    }
}

/* ------------------------------ Search ----------------------------------- */

async function runSearch() {
    const query = els.searchQuery.value.trim();
    state.activeQuery = query;

    if (!query) {
        renderComponents(state.components);
        els.searchSummary.textContent = "Browse the live catalog or launch a semantic search.";
        return;
    }

    try {
        const response = await api(`/api/components/search?q=${encodeURIComponent(query)}`);
        els.searchSummary.textContent = `${response.interpretedIntent} ${response.results.length} result(s) ranked.`;
        const components = response.results.map((item) => ({
            ...item.component,
            searchScore: item.score,
            searchReasons: item.reasons
        }));
        state.components = components;
        renderComponents(components);
    } catch (error) {
        showToast(error.message || "Search failed.", true);
    }
}

function resetSearch() {
    state.activeQuery = "";
    els.searchQuery.value = "";
    els.searchSummary.textContent = "Browse the live catalog or launch a semantic search.";
    state.components = state.allComponents;
    renderComponents(state.components);
}

async function runQueryRecommendations() {
    const query = els.searchQuery.value.trim();
    if (!query) {
        showToast("Enter a natural-language query first.", true);
        return;
    }

    try {
        const response = await api(`/api/components/recommendations?q=${encodeURIComponent(query)}`);
        renderRecommendations(response);
    } catch (error) {
        showToast(error.message || "Unable to generate recommendations.", true);
    }
}

async function showComponentRecommendations(componentId, componentName) {
    try {
        const response = await api(`/api/components/recommendations?componentId=${componentId}`);
        renderRecommendations(response);
        showToast(`✨ AI recommendations generated for ${componentName}.`);
    } catch (error) {
        showToast(error.message || "Unable to load recommendations.", true);
    }
}

/* --------------------------- Command palette ----------------------------- */

let commandActiveIndex = 0;

function initCommandPalette() {
    if (!els.commandPalette) {
        return;
    }
    els.commandInput.addEventListener("input", renderCommandResults);
    els.commandInput.addEventListener("keydown", handleCommandKeydown);
    els.commandResults.addEventListener("click", handleCommandClick);
    els.commandCloseBtn.addEventListener("click", closeCommandPalette);
    els.commandOverlay.addEventListener("click", closeCommandPalette);

    document.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            openCommandPalette();
        }
    });
}

function openCommandPalette() {
    if (!els.commandPalette) {
        return;
    }
    els.commandPalette.classList.remove("hidden");
    document.body.classList.add("palette-open");
    els.commandInput.value = "";
    renderCommandResults();
    window.setTimeout(() => els.commandInput.focus(), 0);
}

function closeCommandPalette() {
    if (!els.commandPalette) {
        return;
    }
    els.commandPalette.classList.add("hidden");
    document.body.classList.remove("palette-open");
}

function commandItems() {
    const query = els.commandInput.value.trim().toLowerCase();
    const components = state.allComponents.filter((component) => {
        if (!query) {
            return true;
        }
        const haystack = `${component.name} ${component.componentCode} ${component.category || ""} ${component.region || ""} ${component.discipline || ""}`.toLowerCase();
        return haystack.includes(query);
    }).slice(0, 20);

    const actions = [
        { type: "action", action: "new", icon: "＋", name: "Open the new component form", sub: "Guided 4-step wizard with AI classification", code: "" },
        { type: "action", action: "export", icon: "⬇", name: "Export catalog as CSV", sub: "Download all filtered components", code: "" },
        { type: "action", action: "refresh", icon: "↻", name: "Reload catalog & analytics", sub: "Fetch fresh data from the API", code: "" }
    ];

    const mapped = components.map((component) => ({
        type: "component",
        id: component.id,
        icon: "🧩",
        name: component.name,
        sub: `${component.componentCode} · ${component.discipline} · ${component.category || "General"}`,
        code: component.componentCode,
        risk: component.stockRisk || "Low"
    }));

    if (query) {
        const actionMatches = actions.filter((action) =>
            `${action.name} ${action.sub}`.toLowerCase().includes(query));
        return [...actionMatches, ...mapped];
    }

    return [...actions, ...mapped];
}

function renderCommandResults() {
    const items = commandItems();
    commandActiveIndex = 0;

    if (!items.length) {
        els.commandResults.innerHTML = `<div class="command-empty">No matching components or actions.</div>`;
        return;
    }

    els.commandResults.innerHTML = items.map((item, index) => {
        if (item.type === "action") {
            return `
                <div class="command-result ${index === commandActiveIndex ? "active" : ""}" data-index="${index}" data-type="action" data-action="${escapeHtml(item.action)}" tabindex="-1">
                    <span class="cmd-kicker">
                        <span class="cmd-icon" aria-hidden="true">${item.icon}</span>
                        <span class="cmd-name">${escapeHtml(item.name)}</span>
                    </span>
                    <span class="cmd-sub">${escapeHtml(item.sub)}</span>
                </div>`;
        }
        return `
            <div class="command-result ${index === commandActiveIndex ? "active" : ""}" data-index="${index}" data-type="component" data-id="${item.id}" tabindex="-1">
                <span class="cmd-kicker">
                    <span class="cmd-icon" aria-hidden="true">${item.icon}</span>
                    <span class="cmd-name">${escapeHtml(item.name)}</span>
                </span>
                <span class="cmd-sub">${escapeHtml(item.sub)}</span>
                <span class="badge ${riskClass(item.risk)} command-risk">${escapeHtml(item.risk)}</span>
            </div>`;
    }).join("");
}

function handleCommandKeydown(event) {
    const items = els.commandResults.querySelectorAll(".command-result");
    if (!items.length) {
        return;
    }

    if (event.key === "ArrowDown") {
        event.preventDefault();
        commandActiveIndex = Math.min(commandActiveIndex + 1, items.length - 1);
        paintActive(items);
    } else if (event.key === "ArrowUp") {
        event.preventDefault();
        commandActiveIndex = Math.max(commandActiveIndex - 1, 0);
        paintActive(items);
    } else if (event.key === "Enter") {
        event.preventDefault();
        const active = els.commandResults.querySelector(".command-result.active");
        if (active) {
            activateCommand(active);
        }
    } else if (event.key === "Escape") {
        closeCommandPalette();
    }
}

function paintActive(items) {
    items.forEach((node, index) => {
        node.classList.toggle("active", index === commandActiveIndex);
    });
    const active = items[commandActiveIndex];
    if (active && typeof active.scrollIntoView === "function") {
        active.scrollIntoView({ block: "nearest" });
    }
}

function handleCommandClick(event) {
    const item = event.target.closest(".command-result");
    if (item) {
        activateCommand(item);
    }
}

function activateCommand(item) {
    if (item.dataset.type === "component") {
        const id = Number(item.dataset.id);
        const component = state.allComponents.find((candidate) => candidate.id === id);
        if (component) {
            closeCommandPalette();
            openWizard(component);
        }
    } else if (item.dataset.type === "action") {
        if (item.dataset.action === "new") {
            closeCommandPalette();
            openWizard();
        } else if (item.dataset.action === "export") {
            exportCsv();
        } else if (item.dataset.action === "refresh") {
            refreshAll();
            loadAuditLog();
            showToast("Data refreshed.");
        }
        closeCommandPalette();
    }
}

/* ------------------------------- Export ---------------------------------- */

function exportCsv() {
    const rows = filterComponents(state.components);
    if (!rows.length) {
        showToast("Nothing to export. Adjust your filters.", true);
        return;
    }

    const headers = [
        "Code", "Name", "Discipline", "Category", "SubCategory", "Region",
        "Manufacturer", "Quantity", "MinStock", "MonthlyDemand", "LeadTimeDays",
        "UnitPrice", "StockRisk", "AvailabilityProbability", "DaysToStockout"
    ];

    const esc = (value) => {
        const text = value == null ? "" : String(value);
        return `"${text.replaceAll('"', '""')}"`;
    };

    const lines = rows.map((row) => [
        row.componentCode, row.name, row.discipline, row.category, row.subCategory, row.region,
        row.manufacturer, row.quantity, row.minimumStockLevel, row.monthlyDemand, row.leadTimeDays,
        row.unitPrice, row.stockRisk, row.availabilityProbability, row.predictedDaysToStockout
    ].map(esc).join(","));

    const csv = [headers.map(esc).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `component-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`${rows.length} component(s) exported.`);
}

/* ------------------------------ Skeleton ---------------------------------- */

function showTableSkeleton() {
    if (!els.componentTableBody) {
        return;
    }
    const rows = Array.from({ length: 4 }, () => `
        <tr class="skeleton-row">
            <td><span class="skeleton"></span></td>
            <td><span class="skeleton"></span></td>
            <td><span class="skeleton"></span></td>
            <td><span class="skeleton"></span></td>
            <td><span class="skeleton"></span></td>
            <td><span class="skeleton"></span></td>
            <td><span class="skeleton"></span></td>
        </tr>`).join("");
    els.componentTableBody.innerHTML = rows;
}

/* ------------------------------ Helpers ----------------------------------- */

function animateCount(el, target, suffix = "") {
    if (!el) {
        return;
    }
    const to = Number(target || 0);
    if (Number.isNaN(to)) {
        el.textContent = `${target}${suffix}`;
        return;
    }
    const duration = 600;
    const start = performance.now();
    const from = 0;

    function step(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = `${Math.round(from + (to - from) * eased)}${suffix}`;
        if (progress < 1) {
            requestAnimationFrame(step);
        }
    }
    requestAnimationFrame(step);
}

function formatDate(value) {
    if (!value) {
        return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    return date.toLocaleString(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}

function truncate(value, max) {
    const text = String(value || "");
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function riskClass(risk) {
    return String(risk || "low").toLowerCase();
}

function showToast(message, isError = false) {
    if (!els.toast) {
        return;
    }
    if (els.toastMessage) {
        els.toastMessage.textContent = message;
    }
    const icon = els.toast.querySelector(".toast-icon");
    if (icon) {
        icon.textContent = isError ? "!" : "✓";
    }
    els.toast.className = `toast ${isError ? "error" : "success"}`;
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => {
        els.toast.className = "toast hidden";
    }, 3200);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

async function api(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options
    });

    if (!response.ok) {
        let message = `Request failed with status ${response.status}`;
        try {
            const data = await response.json();
            if (data.errors) {
                message = Object.values(data.errors).join(" ");
            } else if (data.message) {
                message = data.message;
            }
        } catch (error) {
            const text = await response.text();
            if (text) {
                message = text;
            }
        }
        throw new Error(message);
    }

    if (response.status === 204) {
        return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        return response.json();
    }
    return response.text();
}
