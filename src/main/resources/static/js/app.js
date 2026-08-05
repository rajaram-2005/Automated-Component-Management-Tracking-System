const state = {
    components: [],
    editingId: null,
    activeQuery: ""
};

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
    cacheElements();
    bindEvents();
    await refreshAll();
});

function cacheElements() {
    const ids = [
        "componentId", "componentCode", "name", "discipline", "category", "subCategory", "region", "manufacturer",
        "specifications", "quantity", "minimumStockLevel", "monthlyDemand", "leadTimeDays", "unitPrice",
        "componentForm", "componentTableBody", "searchQuery", "searchSummary", "recommendationSummary",
        "recommendationList", "classificationResult", "domainDistribution", "regionDistribution", "riskList",
        "analyticsInsights", "clearBtn", "classifyBtn", "saveBtn", "searchBtn", "resetBtn", "aiRecommendBtn",
        "formTitle", "toast", "totalComponents", "totalUnits", "lowStockComponents", "averageAvailability"
    ];

    ids.forEach((id) => {
        els[id] = document.getElementById(id);
    });
}

function bindEvents() {
    els.componentForm.addEventListener("submit", handleSubmit);
    els.clearBtn.addEventListener("click", clearForm);
    els.classifyBtn.addEventListener("click", previewClassification);
    els.searchBtn.addEventListener("click", runSearch);
    els.resetBtn.addEventListener("click", resetSearch);
    els.aiRecommendBtn.addEventListener("click", runQueryRecommendations);
    els.searchQuery.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            runSearch();
        }
    });

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

async function refreshAll() {
    await Promise.all([loadComponents(), loadAnalytics()]);
}

async function loadComponents() {
    state.components = await api("/api/components");
    renderComponents(state.components);
}

async function loadAnalytics() {
    const overview = await api("/api/analytics/overview");
    renderAnalytics(overview);
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
        if (state.activeQuery) {
            await runSearch();
        }
    } catch (error) {
        showToast(error.message || "Unable to save component.", true);
    }
}

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
        renderComponents(components);
    } catch (error) {
        showToast(error.message || "Search failed.", true);
    }
}

function resetSearch() {
    state.activeQuery = "";
    els.searchQuery.value = "";
    els.searchSummary.textContent = "Browse the live catalog or launch a semantic search.";
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

function renderComponents(components) {
    if (!components.length) {
        els.componentTableBody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="muted">No components matched the current query.</div>
                </td>
            </tr>`;
        return;
    }

    els.componentTableBody.innerHTML = components.map((component) => {
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
    els.totalComponents.textContent = overview.totalComponents;
    els.totalUnits.textContent = overview.totalUnits;
    els.lowStockComponents.textContent = overview.lowStockComponents;
    els.averageAvailability.textContent = `${Number(overview.averageAvailabilityProbability).toFixed(1)}%`;

    els.domainDistribution.innerHTML = renderDistributionBars(overview.domainDistribution);
    els.regionDistribution.innerHTML = renderDistributionBars(overview.regionDistribution);

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
    els.classificationResult.innerHTML = `<p class="muted">No prediction yet. Enter a component name and specifications, then click <strong>Preview AI Classification</strong>.</p>`;
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
        if (state.activeQuery) {
            await runSearch();
        }
    } catch (error) {
        showToast(error.message || "Delete failed.", true);
    }
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

function valueOf(id) {
    return els[id].value.trim();
}

function riskClass(risk) {
    return String(risk || "low").toLowerCase();
}

function showToast(message, isError = false) {
    els.toast.textContent = message;
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
