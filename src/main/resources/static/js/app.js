"use strict";

const state = {
    allComponents: [],
    components: [],
    editingId: null,
    activeQuery: "",
    filters: { domain: "", region: "", risk: "" }
};

const els = {};

const DONUT_COLORS = {
    ECE: "#5f8cff",
    EEE: "#22c55e",
    MECHANICAL: "#f59e0b"
};

document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    applySavedTheme();
    bindEvents();
    showTableSkeleton();
    initCommandPalette();
    refreshAll();
    loadAuditLog();
});

function cacheElements() {
    const ids = [
        "componentId", "componentCode", "name", "discipline", "category", "subCategory", "region", "manufacturer",
        "specifications", "quantity", "minimumStockLevel", "monthlyDemand", "leadTimeDays", "unitPrice",
        "componentForm", "componentTableBody", "searchQuery", "searchSummary", "recommendationSummary",
        "recommendationList", "classificationResult", "domainDistribution", "regionDistribution", "riskList",
        "analyticsInsights", "clearBtn", "classifyBtn", "saveBtn", "searchBtn", "resetBtn", "aiRecommendBtn",
        "formTitle", "toast", "toastMessage", "toastClose", "totalComponents", "totalUnits", "lowStockComponents",
        "averageAvailability", "themeToggle", "commandOpenBtn", "commandInlineBtn", "exportBtn",
        "filterDomain", "filterRegion", "filterRisk", "catalogCount", "domainDonut", "donutLegend",
        "auditList", "auditRefreshBtn", "commandPalette", "commandOverlay", "commandInput",
        "commandCloseBtn", "commandResults"
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
    els.clearBtn.addEventListener("click", () => {
        clearForm();
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
    els.classifyBtn.addEventListener("click", previewClassification);
    els.searchBtn.addEventListener("click", runSearch);
    els.resetBtn.addEventListener("click", resetSearch);
    els.aiRecommendBtn.addEventListener("click", runQueryRecommendations);
    els.exportBtn.addEventListener("click", exportCsv);
    els.auditRefreshBtn.addEventListener("click", loadAuditLog);

    els.searchQuery.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            runSearch();
        }
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

        const id = Number(button.dataset.id);
        const action = button.dataset.action;
        const component = state.components.find((item) => item.id === id);

        if (action === "edit" && component) {
            populateForm(component);
        }

        if (action === "delete" && component) {
            await deleteComponent(component);
        }

        if (action === "recommend" && component) {
            await showComponentRecommendations(component.id, component.name);
        }
    });
}

/* ---------------------------- Theme ----------------------------------- */

function applySavedTheme() {
    const stored = localStorage.getItem("cms-theme");
    const theme = stored === "light" ? "light" : "dark";
    setTheme(theme);
}

function toggleTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("cms-theme", next);
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

/* --------------------------- Data loading ----------------------------- */

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

/* ------------------------------ Filters -------------------------------- */

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

/* ---------------------------- Rendering ------------------------------- */

function renderComponents(components) {
    if (!els.componentTableBody) {
        return;
    }

    const filtered = filterComponents(components);
    if (els.catalogCount) {
        els.catalogCount.textContent = `${filtered.length} of ${components.length} shown`;
    }

    if (!filtered.length) {
        const message = components.length ? "No components matched the current filters." : "No components matched the current query.";
        els.componentTableBody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="muted">${escapeHtml(message)}</div>
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

        return `
            <tr>
                <td>
                    <div class="component-name">${escapeHtml(component.name)}</div>
                    <div class="component-meta">${escapeHtml(component.componentCode)} · ${escapeHtml(component.manufacturer || "Independent Supplier")}</div>
                    ${scoreMarkup}
                    ${reasonMarkup}
                </td>
                <td>${escapeHtml(component.discipline || "-")}</td>
                <td>
                    <div>${escapeHtml(component.category || "General")}</div>
                    <div class="component-meta">${escapeHtml(component.subCategory || "General sub-category")}</div>
                </td>
                <td>${escapeHtml(component.region || "-")}</td>
                <td>
                    <div>${component.quantity} units</div>
                    <div class="component-meta">Min ${component.minimumStockLevel} · Demand ${Number(component.monthlyDemand).toFixed(1)}/mo</div>
                </td>
                <td>
                    <span class="badge ${riskClass(component.stockRisk)}">${escapeHtml(component.stockRisk || "LOW")}</span>
                    <div class="component-meta">${Number(component.availabilityProbability || 0).toFixed(1)}% confidence · ${Number(component.predictedDaysToStockout || 0).toFixed(1)} days</div>
                </td>
                <td>
                    <div class="table-actions">
                        <button type="button" class="ghost-btn" data-action="edit" data-id="${component.id}">Edit</button>
                        <button type="button" class="secondary-btn" data-action="recommend" data-id="${component.id}">Recommend</button>
                        <button type="button" class="ghost-btn" data-action="delete" data-id="${component.id}">Delete</button>
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

    drawDonut(overview.domainDistribution);

    els.riskList.innerHTML = overview.atRiskComponents.map((item) => `
        <div class="metric-card">
            <div class="component-name">${escapeHtml(item.name)}</div>
            <div class="component-meta">${escapeHtml(item.componentCode)} · ${escapeHtml(item.discipline)}</div>
            <div class="reason-list">
                <span>${Number(item.predictedDaysToStockout).toFixed(1)} days to stockout</span>
                <span>${Number(item.availabilityProbability).toFixed(1)}% availability</span>
                <span class="badge ${riskClass(item.stockRisk)}">${escapeHtml(item.stockRisk)}</span>
            </div>
        </div>`).join("") || `<div class="muted">No at-risk components detected.</div>`;

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

    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) - 8;
    const thickness = 20;
    ctx.clearRect(0, 0, width, height);

    const theme = document.documentElement.getAttribute("data-theme");
    const textColor = theme === "light" ? "#0f172a" : "#f3f7ff";

    let startAngle = -Math.PI / 2;
    entries.forEach(([label, value]) => {
        const sliceAngle = (value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.arc(centerX, centerY, radius - thickness, startAngle + sliceAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = DONUT_COLORS[label] || "#5f8cff";
        ctx.fill();
        startAngle += sliceAngle;
    });

    const centerLabel = `${total}`;
    ctx.fillStyle = textColor;
    ctx.font = "700 28px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(centerLabel, centerX, centerY - 6);
    ctx.font = "400 12px Inter, system-ui, sans-serif";
    ctx.fillStyle = theme === "light" ? "#5b6b85" : "#a6b4d1";
    ctx.fillText("components", centerX, centerY + 16);

    if (els.donutLegend) {
        els.donutLegend.innerHTML = entries.map(([label, value]) => `
            <div class="legend-row">
                <span class="legend-swatch" style="background:${DONUT_COLORS[label] || "#5f8cff"}"></span>
                <span>${escapeHtml(label)}</span>
                <span style="margin-left:auto">${value}</span>
            </div>`).join("");
    }
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
            <div class="component-meta">${escapeHtml(item.component.componentCode)} · ${escapeHtml(item.component.category)} · ${escapeHtml(item.component.region)}</div>
            <div class="reason-list">
                <span>Score ${Number(item.score).toFixed(1)}</span>
                <span>${Number(item.component.availabilityProbability).toFixed(1)}% availability</span>
                <span class="badge ${riskClass(item.component.stockRisk)}">${escapeHtml(item.component.stockRisk)}</span>
            </div>
            <div class="reason-list">${item.reasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")}</div>
        </div>`).join("");
}

function renderClassification(response) {
    els.classificationResult.innerHTML = `
        <div class="metric-card">
            <div class="component-name">${escapeHtml(response.summary)}</div>
            <div class="reason-list">
                <span>${escapeHtml(response.discipline)}</span>
                <span>${escapeHtml(response.category)}</span>
                <span>${Number(response.confidence).toFixed(1)}% confidence</span>
            </div>
            <div class="reason-list">${response.matchedSignals.map((signal) => `<span>${escapeHtml(signal)}</span>`).join("")}</div>
        </div>`;
}

/* ------------------------------ Forms ---------------------------------- */

function populateForm(component) {
    state.editingId = component.id;
    els.componentId.value = component.id;
    els.componentCode.value = component.componentCode || "";
    els.name.value = component.name || "";
    els.discipline.value = component.discipline || "";
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
    els.formTitle.textContent = `Edit ${component.name}`;
    els.saveBtn.textContent = "Update Component";
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearForm() {
    state.editingId = null;
    els.componentForm.reset();
    els.componentId.value = "";
    els.region.value = "Asia-Pacific";
    els.formTitle.textContent = "Register New Component";
    els.saveBtn.textContent = "Save Component";
    if (els.classificationResult) {
        els.classificationResult.innerHTML = `<p class="muted">No prediction yet. Enter a component name and specifications, then click <strong>Preview AI Classification</strong>.</p>`;
    }
}

async function handleSubmit(event) {
    event.preventDefault();

    const payload = {
        componentCode: valueOf("componentCode") || null,
        name: valueOf("name"),
        discipline: valueOf("discipline") || null,
        category: valueOf("category") || null,
        subCategory: valueOf("subCategory") || null,
        region: valueOf("region"),
        manufacturer: valueOf("manufacturer") || null,
        specifications: valueOf("specifications") || null,
        quantity: Number(valueOf("quantity")),
        minimumStockLevel: Number(valueOf("minimumStockLevel")),
        monthlyDemand: Number(valueOf("monthlyDemand")),
        leadTimeDays: Number(valueOf("leadTimeDays")),
        unitPrice: Number(valueOf("unitPrice"))
    };

    const isEditing = Boolean(state.editingId);
    const url = isEditing ? `/api/components/${state.editingId}` : "/api/components";
    const method = isEditing ? "PUT" : "POST";

    try {
        await api(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        showToast(isEditing ? "Component updated successfully." : "Component created successfully.");
        clearForm();
        await refreshAll();
        await loadAuditLog();
        if (state.activeQuery) {
            await runSearch();
        }
    } catch (error) {
        showToast(error.message || "Unable to save component.", true);
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
        if (state.editingId === component.id) {
            clearForm();
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

/* ------------------------------ Search --------------------------------- */

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
        showToast(`AI recommendations generated for ${componentName}.`);
    } catch (error) {
        showToast(error.message || "Unable to load recommendations.", true);
    }
}

async function previewClassification() {
    const name = valueOf("name");
    const specifications = valueOf("specifications");
    const categoryHint = valueOf("category");

    if (!name && !specifications) {
        showToast("Enter a component name or specifications first.", true);
        return;
    }

    try {
        const response = await api("/api/ai/classify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, specifications, categoryHint })
        });

        renderClassification(response);
        if (!valueOf("discipline")) {
            els.discipline.value = response.discipline;
        }
        if (!valueOf("category")) {
            els.category.value = response.category;
        }
    } catch (error) {
        showToast(error.message || "Classification failed.", true);
    }
}

/* --------------------------- Command palette --------------------------- */

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
        { type: "action", action: "new", name: "Create new component", sub: "Reset the registration form", code: "" },
        { type: "action", action: "export", name: "Export catalog as CSV", sub: "Download all filtered components", code: "" },
        { type: "action", action: "refresh", name: "Reload catalog & analytics", sub: "Fetch fresh data from the API", code: "" }
    ];

    if (query) {
        const actionMatches = actions.filter((action) =>
            `${action.name} ${action.sub}`.toLowerCase().includes(query));
        return [...actionMatches, ...components.map((component) => ({
            type: "component",
            id: component.id,
            name: component.name,
            sub: `${component.componentCode} · ${component.discipline} · ${component.category || "General"}`,
            code: component.componentCode,
            risk: component.stockRisk || "Low"
        }))];
    }

    return [...actions, ...components.map((component) => ({
        type: "component",
        id: component.id,
        name: component.name,
        sub: `${component.componentCode} · ${component.discipline} · ${component.category || "General"}`,
        code: component.componentCode,
        risk: component.stockRisk || "Low"
    }))];
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
                    <span class="cmd-kicker"><span class="cmd-name">${escapeHtml(item.name)}</span></span>
                    <span class="cmd-sub">${escapeHtml(item.sub)}</span>
                </div>`;
        }
        return `
            <div class="command-result ${index === commandActiveIndex ? "active" : ""}" data-index="${index}" data-type="component" data-id="${item.id}" tabindex="-1">
                <span class="cmd-kicker"><span class="cmd-name">${escapeHtml(item.name)}</span></span>
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
    if (active) {
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
            populateForm(component);
            closeCommandPalette();
        }
    } else if (item.dataset.type === "action") {
        if (item.dataset.action === "new") {
            clearForm();
            window.scrollTo({ top: 0, behavior: "smooth" });
            showToast("Ready to register a new component.");
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

/* ------------------------------- Export -------------------------------- */

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

/* ------------------------------ Skeleton ------------------------------- */

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

/* ------------------------------ Helpers -------------------------------- */

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

function valueOf(id) {
    return els[id].value.trim();
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
