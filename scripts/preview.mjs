#!/usr/bin/env node
/*
 * JVM-free UI preview for the Compound Management System frontend.
 *
 * Serves the Thymeleaf templates (sanitized), the static CSS/JS, and an
 * in-memory mock of the Spring Boot REST API (same routes and JSON shapes),
 * so the colorful dashboard + 4-step wizard form can be reviewed with:
 *
 *     node scripts/preview.mjs          # http://localhost:8080
 *
 * This is a DEV TOOL only — it does not replace the real application.
 * Run the full stack with: mvn spring-boot:run
 */

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RES = join(ROOT, "src/main/resources");
const PORT = Number(process.env.PORT || 8080);

/* ------------------------------ template sanitizer ---------------------- */

function sanitizeTemplate(html) {
    return html
        .replace(/ xmlns:th="[^"]*"/g, "")
        .replace(/th:href="@\{([^}]*)\}"/g, 'href="$1"')
        .replace(/th:src="@\{([^}]*)\}"/g, 'src="$1"')
        .replace(/th:action="@\{([^}]*)\}"/g, 'action="$1"')
        .replace(/th:field="\*\{([^}]*)\}"/g, 'name="$1" id="$1"')
        .replace(/th:(if|unless|each|text|errors|object|value|utext)="[^"]*"/g, "");
}

/* ------------------------------ domain logic ---------------------------- */

const CLASSIFICATION_RULES = {
    ECE: ["rf", "antenna", "lora", "wifi", "wi-fi", "bluetooth", "transceiver", "mcu", "microcontroller", "fpga", "i2c", "spi", "uart", "communication", "telemetry", "iot", "mems", "imu", "gyroscope", "accelerometer", "digital logic", "programmable logic", "ddr3", "ethernet", "gpio", "2.4ghz", "433mhz", "embedded"],
    EEE: ["voltage", "volt", "current", "amp", "igbt", "inverter", "motor", "bldc", "relay", "plc", "power", "battery", "capacitor", "resistor", "transformer", "rectifier", "hall effect", "din rail", "control panel", "field-oriented", "48v", "24v", "600v", "3.3v", "sensor"],
    MECHANICAL: ["bearing", "piston", "cylinder", "gear", "pulley", "belt", "fastener", "bolt", "nut", "washer", "stainless", "aluminium", "aluminum", "steel", "bore", "stroke", "torque", "pneumatic", "hydraulic", "valve", "shaft", "machining", "cnc", "friction", "load", "mm id", "mm od"]
};

const CATEGORY_HINTS = [
    { cat: "Communication Modules", sub: "RF Telemetry", words: ["lora", "transceiver", "rf", "telemetry", "antenna"] },
    { cat: "Embedded & IoT Controllers", sub: "Wireless MCU", words: ["esp32", "mcu", "microcontroller", "iot", "arduino"] },
    { cat: "Digital Logic & Prototyping", sub: "Programmable Logic", words: ["fpga", "logic", "artix"] },
    { cat: "Power Electronics", sub: "Inverter Switching", words: ["igbt", "inverter", "rectifier", "power module"] },
    { cat: "Drives & Motion Control", sub: "Motor Control", words: ["motor", "bldc", "driver", "servo", "stepper"] },
    { cat: "Sensors & Instrumentation", sub: "Motion Sensor", words: ["imu", "mems", "gyroscope", "accelerometer"] },
    { cat: "Sensors & Instrumentation", sub: "Current Measurement", words: ["hall effect", "current sensor"] },
    { cat: "Industrial Control", sub: "Relay Interface", words: ["plc", "relay", "din rail"] },
    { cat: "Bearings & Motion", sub: "Rotary Bearing", words: ["bearing", "rotary", "friction"] },
    { cat: "Fluid Power & Actuation", sub: "Cylinder", words: ["pneumatic", "hydraulic", "cylinder", "valve"] },
    { cat: "Mechanical Power Transmission", sub: "Pulley", words: ["pulley", "belt", "gear", "timing"] },
    { cat: "Fasteners & Fabrication", sub: "Fasteners", words: ["fastener", "bolt", "nut", "washer", "screw"] }
];

function classify(name, specifications, categoryHint) {
    const text = `${name || ""} ${specifications || ""} ${categoryHint || ""}`.toLowerCase();
    const hits = {};
    const signals = [];
    for (const [domain, words] of Object.entries(CLASSIFICATION_RULES)) {
        const matched = words.filter((w) => text.includes(w));
        hits[domain] = matched.length;
        matched.slice(0, 6).forEach((w) => signals.push(`${domain} signal: “${w}”`));
    }
    let discipline = "EEE";
    let best = -1;
    for (const [domain, score] of Object.entries(hits)) {
        if (score > best) {
            best = score;
            discipline = domain;
        }
    }
    if (best <= 0) {
        signals.push("heuristic fallback: generic electrical assumption");
    }
    let category = "General Components";
    let subCategory = "Uncategorized";
    for (const hint of CATEGORY_HINTS) {
        if (hint.words.some((w) => text.includes(w))) {
            category = hint.cat;
            subCategory = hint.sub;
            signals.push(`category lexicon match → ${hint.cat}`);
            break;
        }
    }
    const confidence = Math.max(55, Math.min(95, 55 + best * 7 + (text.length > 60 ? 10 : 0) + (categoryHint ? 5 : 0)));
    const label = { ECE: "Electronics & Communication", EEE: "Electrical & Electronics", MECHANICAL: "Mechanical" }[discipline];
    return {
        discipline,
        category,
        confidence: Number(confidence.toFixed(1)),
        matchedSignals: signals.slice(0, 8),
        summary: `Automated prediction: ${label} — ${category}${subCategory !== "Uncategorized" ? ` · ${subCategory}` : ""}.`
    };
}

function forecast(c) {
    const demand = Math.max(c.monthlyDemand ?? 0, 0.1);
    const daysToStockout = c.quantity <= 0 ? 0 : (c.quantity / demand) * 30.0;
    const projected = c.quantity - demand * (c.leadTimeDays / 30.0);
    const buffer = (projected - c.minimumStockLevel) / Math.max(c.minimumStockLevel, 1);
    const probability = Math.max(5, Math.min(99, (1 / (1 + Math.exp(-buffer))) * 85.0 + 10.0));
    let risk = "LOW";
    if (c.quantity <= Math.max(1, c.minimumStockLevel / 2) || daysToStockout <= c.leadTimeDays) risk = "CRITICAL";
    else if (c.quantity <= c.minimumStockLevel || daysToStockout <= c.leadTimeDays + 30) risk = "HIGH";
    else if (daysToStockout <= 90) risk = "MODERATE";
    const narratives = {
        CRITICAL: "Projected depletion is inside supplier lead time. Trigger replenishment immediately.",
        HIGH: "Stock is vulnerable to near-term demand spikes. Plan replenishment soon.",
        MODERATE: "Coverage is acceptable but should be observed against monthly demand.",
        LOW: "Healthy coverage and low immediate replenishment pressure."
    };
    return {
        predictedDaysToStockout: round(daysToStockout),
        availabilityProbability: round(probability),
        stockRisk: risk,
        analyticsNarrative: narratives[risk]
    };
}

const round = (v) => Math.round(v * 100) / 100;

/* ------------------------------ mock store ------------------------------ */

let nextId = 1;
let auditSeq = 1;

function seed(name, domain, category, subCategory, region, manufacturer, specs, qty, min, demand, lead, price, code) {
    const cls = classify(name, specs, category);
    const entity = {
        id: nextId++,
        componentCode: code,
        name,
        discipline: domain,
        category,
        subCategory,
        region,
        manufacturer,
        specifications: specs,
        quantity: qty,
        minimumStockLevel: min,
        monthlyDemand: demand,
        leadTimeDays: lead,
        unitPrice: price,
        classificationConfidence: cls.confidence,
        createdAt: new Date(Date.now() - 86400000 * (2 + nextId)).toISOString(),
        updatedAt: new Date().toISOString()
    };
    return withAnalytics(entity);
}

function withAnalytics(c) {
    const f = forecast(c);
    return { ...c, ...f };
}

const components = [
    seed("ESP32-WROOM-32 MCU", "ECE", "Embedded & IoT Controllers", "Wireless MCU", "Asia-Pacific", "Espressif", "Dual-core Wi-Fi and Bluetooth microcontroller, 3.3V, 240MHz, UART SPI I2C, OTA capable", 72, 25, 18, 21, 4.9, "ECE-ESP3-A1B2C3"),
    seed("3-Phase IGBT Power Module", "EEE", "Power Electronics", "Inverter Switching", "Europe", "Infineon", "600V 50A inverter switching module for motor drives and industrial converters", 14, 12, 6, 35, 48.0, "EEE-IGBT-P4D5E6"),
    seed("Hall Effect Current Sensor ACS758", "EEE", "Sensors & Instrumentation", "Current Measurement", "North America", "Allegro", "50A bidirectional current sensor with isolation-friendly Hall effect measurement", 33, 10, 7, 14, 8.1, "EEE-HALL-Q7R8S9"),
    seed("LoRa SX1278 Transceiver Module", "ECE", "Communication Modules", "RF Telemetry", "Asia-Pacific", "Semtech", "433MHz RF transceiver module for long-range telemetry, SPI interface, low-power operation", 41, 15, 9, 18, 7.4, "ECE-LORA-L1M2N3"),
    seed("FPGA Development Board Artix-7", "ECE", "Digital Logic & Prototyping", "Programmable Logic", "Europe", "AMD Xilinx", "Artix-7 FPGA board with DDR3, Ethernet, GPIO and prototyping support for digital systems", 9, 6, 2, 42, 165.0, "ECE-FPGA-F4G5H6"),
    seed("BLDC Motor Driver", "EEE", "Drives & Motion Control", "Motor Control", "Asia-Pacific", "Texas Instruments", "48V 30A field-oriented control driver for BLDC motors with current feedback support", 17, 8, 5, 28, 39.9, "EEE-BLDC-B7C8D9"),
    seed("Deep Groove Ball Bearing 6204", "MECHANICAL", "Bearings & Motion", "Rotary Bearing", "Europe", "SKF", "20mm ID, 47mm OD sealed bearing for rotary systems, low friction, industrial duty", 120, 40, 20, 12, 6.2, "MEC-BEAR-E1F2G3"),
    seed("Pneumatic Cylinder ISO 15552", "MECHANICAL", "Fluid Power & Actuation", "Cylinder", "North America", "Festo", "Double acting pneumatic cylinder, 32mm bore, 100mm stroke, automation line ready", 11, 8, 3, 30, 79.0, "MEC-PNEU-H4J5K6"),
    seed("Aluminium Timing Pulley GT2", "MECHANICAL", "Mechanical Power Transmission", "Pulley", "Asia-Pacific", "Gates", "20 tooth GT2 timing pulley for automation, CNC positioning and belt transmission assemblies", 64, 18, 11, 16, 12.5, "MEC-PULL-L7M8N9"),
    seed("Stainless Steel Fastener Kit M6", "MECHANICAL", "Fasteners & Fabrication", "Fasteners", "Global", "Bosch Rexroth", "A2 stainless bolts, nuts and washers for enclosure, frame and fabrication assemblies", 205, 60, 35, 10, 0.35, "MEC-FAST-P1Q2R3"),
    seed("MEMS IMU 9-DOF Sensor", "ECE", "Sensors & Instrumentation", "Motion Sensor", "Asia-Pacific", "Bosch", "Accelerometer gyroscope magnetometer combo with I2C/SPI support for robotics and drones", 28, 12, 8, 20, 11.8, "ECE-IMU-S4T5U6"),
    seed("Programmable Logic Controller Relay Module", "EEE", "Industrial Control", "Relay Interface", "Europe", "Siemens", "24V DIN rail relay interface with 4-channel output for PLC driven industrial control panels", 23, 10, 4, 24, 29.0, "EEE-PLC-V7W8X9")
];

const audit = [{
    id: auditSeq++,
    username: "engineer",
    action: "CREATE",
    entityType: "COMPONENT",
    entityId: "1",
    summary: "Seeded 12 demo components into the global catalog",
    timestamp: new Date(Date.now() - 3600_000).toISOString()
}];

function pushAudit(action, entityId, summary) {
    audit.unshift({ id: auditSeq++, username: "engineer", action, entityType: "COMPONENT", entityId: String(entityId), summary, timestamp: new Date().toISOString() });
    if (audit.length > 60) audit.pop();
}

function autoCode(name, discipline) {
    const prefix = { ECE: "ECE", EEE: "EEE", MECHANICAL: "MEC" }[discipline] || "GEN";
    const slug = (name || "PART").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 4).padEnd(4, "X");
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `${prefix}-${slug}-${rand.slice(0, 3)}${rand.slice(3, 6)}`;
}

/* ------------------------------ endpoints -------------------------------- */

function overview() {
    const totalComponents = components.length;
    const totalUnits = components.reduce((s, c) => s + c.quantity, 0);
    const lowStock = components.filter((c) => c.stockRisk === "HIGH" || c.stockRisk === "CRITICAL").length;
    const shortages = components.filter((c) => c.predictedDaysToStockout <= 30).length;
    const avg = totalComponents ? round(components.reduce((s, c) => s + c.availabilityProbability, 0) / totalComponents) : 0;
    const count = (key) => components.reduce((m, c) => { m[c[key]] = (m[c[key]] || 0) + 1; return m; }, {});
    const severity = { LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 };
    const atRisk = [...components]
        .sort((a, b) => (severity[b.stockRisk] - severity[a.stockRisk]) || (a.predictedDaysToStockout - b.predictedDaysToStockout))
        .slice(0, 5)
        .map((c) => ({ id: c.id, componentCode: c.componentCode, name: c.name, discipline: c.discipline, predictedDaysToStockout: c.predictedDaysToStockout, availabilityProbability: c.availabilityProbability, stockRisk: c.stockRisk }));
    const dom = count("discipline");
    const reg = count("region");
    const topDom = Object.entries(dom).sort((a, b) => b[1] - a[1])[0];
    const topReg = Object.entries(reg).sort((a, b) => b[1] - a[1])[0];
    return {
        totalComponents,
        totalUnits,
        lowStockComponents: lowStock,
        predictedShortagesThisMonth: shortages,
        averageAvailabilityProbability: avg,
        domainDistribution: dom,
        regionDistribution: reg,
        atRiskComponents: atRisk,
        keyInsights: [
            `${totalComponents} active component profiles represent ${totalUnits} stocked units across global engineering inventories.`,
            `${lowStock} components are currently flagged as high-risk or critical, while ${shortages} may deplete within 30 days.`,
            `Average predicted availability confidence is ${avg}%.`,
            topDom ? `${topDom[0]} leads the catalog with ${topDom[1]} managed components.` : "No engineering domain distribution available yet.",
            topReg ? `${topReg[0]} is the most represented sourcing region.` : "No sourcing region data available yet."
        ]
    };
}

function search(q) {
    const tokens = String(q || "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !["with", "from", "show", "find", "the", "and", "for", "all"].includes(t));
    const lowIntent = /low\s*stock|scarce|shortage|running out/.test(q.toLowerCase());
    const highIntent = /high\s*(availability|stock)|ample|plenty/.test(q.toLowerCase());
    const intentBits = [];
    if (lowIntent) intentBits.push("low-stock intent");
    if (highIntent) intentBits.push("high-availability intent");
    if (tokens.length) intentBits.push(`tokens: ${tokens.slice(0, 6).join(", ")}`);
    const interpretedIntent = `Interpreted “${q}” — ${intentBits.join(" · ") || "general catalog scan"}. Returning`;

    const scored = components.map((c) => {
        const hay = `${c.name} ${c.category || ""} ${c.subCategory || ""} ${c.specifications || ""} ${c.manufacturer || ""} ${c.region || ""} ${c.discipline}`.toLowerCase();
        let score = 0;
        const reasons = [];
        for (const t of tokens) {
            if (hay.includes(t)) {
                score += 3;
                reasons.push(`matched “${t}”`);
            }
        }
        if (lowIntent && c.quantity <= c.minimumStockLevel * 1.5) {
            score += 4;
            reasons.push("low stock vs minimum level");
        }
        if (highIntent && c.availabilityProbability >= 60) {
            score += 3;
            reasons.push("high availability confidence");
        }
        return { c, score, reasons };
    }).filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 25);

    return {
        query: q,
        interpretedIntent,
        results: scored.map(({ c, score, reasons }) => ({ component: c, score, reasons: reasons.slice(0, 4) }))
    };
}

function recommendations({ componentId, q }) {
    if (componentId != null) {
        const base = components.find((c) => c.id === Number(componentId));
        if (!base) return { summary: "Component not found.", recommendations: [] };
        const recs = components
            .filter((c) => c.id !== base.id)
            .map((c) => {
                let score = 0;
                const reasons = [];
                if (c.discipline === base.discipline) { score += 3; reasons.push(`same ${c.discipline} domain`); }
                if (c.category === base.category) { score += 2; reasons.push(`shared category ${c.category}`); }
                if (c.region === base.region) { score += 1; reasons.push(`same sourcing region ${c.region}`); }
                score += c.availabilityProbability / 40;
                if (c.availabilityProbability >= 70) reasons.push("high predicted availability");
                return { c, score, reasons };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 4);
        return {
            summary: `Complementary and higher-availability alternatives for ${base.name}, ranked by domain affinity, category match, and forecasted availability.`,
            recommendations: recs.map(({ c, score, reasons }) => ({ component: c, score: round(score), reasons }))
        };
    }
    const found = search(q || "");
    return {
        summary: `Recommendations inferred from “${q}”: ${found.results.length} catalog candidates ranked by semantic match and availability.`,
        recommendations: found.results.slice(0, 4).map((r) => ({ component: r.component, score: r.score, reasons: r.reasons }))
    };
}

function validateComponent(body) {
    const errors = {};
    if (!body.name || !String(body.name).trim()) errors.name = "Component name is required";
    if (body.name && String(body.name).length > 200) errors.name = "Component name is too long";
    if (!body.region || !String(body.region).trim()) errors.region = "Region is required";
    for (const f of ["quantity", "minimumStockLevel", "monthlyDemand", "leadTimeDays", "unitPrice"]) {
        if (body[f] == null || Number(body[f]) < 0) errors[f] = `${f} must be 0 or greater`;
    }
    return Object.keys(errors).length ? errors : null;
}

function normalize(body, existing) {
    const discipline = body.discipline || classify(body.name, body.specifications, body.category).discipline;
    const category = body.category || classify(body.name, body.specifications, body.category).category;
    const merged = {
        ...(existing || { id: nextId++, createdAt: new Date().toISOString(), classificationConfidence: 0 }),
        componentCode: body.componentCode || existing?.componentCode || autoCode(body.name, discipline),
        name: String(body.name).trim(),
        discipline,
        category,
        subCategory: body.subCategory || "General",
        region: body.region,
        manufacturer: body.manufacturer || null,
        specifications: body.specifications || null,
        quantity: Number(body.quantity),
        minimumStockLevel: Number(body.minimumStockLevel),
        monthlyDemand: Number(body.monthlyDemand),
        leadTimeDays: Number(body.leadTimeDays),
        unitPrice: Number(body.unitPrice),
        classificationConfidence: body.classificationConfidence ?? (existing?.classificationConfidence || 72.5),
        updatedAt: new Date().toISOString()
    };
    return withAnalytics(merged);
}

/* ------------------------- PG-BNN mock engine ----------------------------
   Mirrors PgbnnEngine's contract: an ensemble of seeded members around the
   analytic physics prior, a conjugate-Gaussian posterior with a 90% band,
   and an undirected token-affinity graph for visualization.                */

const PG = { status: "ready", ensemble: 8, hidden: 24, features: 61, epochs: 120, trainedAt: null, lossCurve: [], finalLoss: 0 };

const hash32 = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h = ((h ^ s.charCodeAt(i)) * 16777619) | 0;
    }
    return Math.abs(h);
};
const rand01 = (h) => (h % 10007) / 10007;

function baseDays(c) {
    const demand = Math.max(c.monthlyDemand || 0, 0.1);
    return c.quantity <= 0 ? 0 : (c.quantity / demand) * 30;
}

function riskFrom(c, days) {
    const min = c.minimumStockLevel || 0;
    const lead = c.leadTimeDays || 0;
    if (c.quantity <= Math.max(1, min / 2) || days <= lead) return "CRITICAL";
    if (c.quantity <= min || days <= lead + 30) return "HIGH";
    if (days <= 90) return "MODERATE";
    return "LOW";
}

function pgbnnMembers(c) {
    const prior = Math.max(baseDays(c), 0);
    const out = [];
    for (let m = 0; m < PG.ensemble; m++) {
        const r = rand01(hash32(`${c.id ?? 0}|${c.name}|member-${m}`));
        out.push(Math.max(0, Math.min(3650, prior * (1 + (r - 0.42) * 0.55) + (r - 0.5) * 3)));
    }
    return out;
}

function pgbnnForecast(c) {
    const prior = Math.max(baseDays(c), 0);
    const members = pgbnnMembers(c);
    const mean = members.reduce((s, v) => s + v, 0) / members.length;
    let variance = 0;
    members.forEach((v) => { variance += (v - mean) ** 2; });
    const std = Math.max(Math.sqrt(variance / Math.max(members.length - 1, 1)), 2 + 0.06 * mean);
    const s0 = Math.max(3, 0.18 * prior + 1);
    const precision = 1 / (s0 * s0) + 1 / (std * std);
    const posterior = ((prior / (s0 * s0)) + (mean / (std * std))) / precision;
    const sigma = Math.sqrt(1 / precision);
    const tol = Math.max(1.5, 0.25 * mean);
    const agreement = Math.round(members.filter((v) => Math.abs(v - mean) <= tol).length * 100 / members.length);
    const round2 = (v) => Math.round((isFinite(v) ? v : 0) * 100) / 100;
    return {
        priorDays: round2(prior),
        neuralMeanDays: round2(mean),
        sigmaDays: round2(sigma),
        posteriorDays: round2(posterior),
        lowerDays: Math.max(0, round2(posterior - 1.6449 * sigma)),
        upperDays: round2(posterior + 1.6449 * sigma),
        agreementPercent: agreement,
        memberDays: members.map(round2),
        neuralActive: true
    };
}

function pgbnnTokenSet(c) {
    return new Set(`${c.name || ""} ${c.specifications || ""} ${c.category || ""}`.toLowerCase()
        .split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !["with", "for", "the", "and", "from"].includes(t)));
}

function pgbnnGraph() {
    const tokenSets = components.map(pgbnnTokenSet);
    const edges = [];
    for (let i = 0; i < components.length; i++) {
        for (let j = i + 1; j < components.length; j++) {
            const a = components[i];
            const b = components[j];
            const inter = [...tokenSets[i]].filter((t) => tokenSets[j].has(t)).length;
            const union = new Set([...tokenSets[i], ...tokenSets[j]]).size;
            const jac = union ? inter / union : 0;
            const w = 0.55 * jac
                + (a.discipline === b.discipline ? 0.15 : 0)
                + (a.category === b.category ? 0.12 : 0)
                + (a.region === b.region ? 0.08 : 0)
                + 0.10 * (1 - Math.min(1, Math.abs(Math.log1p(a.quantity) - Math.log1p(b.quantity)) / 3));
            if (w >= 0.3) edges.push({ source: a.id, target: b.id, weight: Math.round(w * 1000) / 1000 });
        }
    }
    edges.sort((x, y) => y.weight - x.weight);
    const trimmed = edges.slice(0, 60);
    const degrees = {};
    trimmed.forEach((e) => { degrees[e.source] = (degrees[e.source] || 0) + 1; degrees[e.target] = (degrees[e.target] || 0) + 1; });
    const nodes = components.map((c) => ({
        id: c.id,
        name: c.name,
        componentCode: c.componentCode,
        discipline: c.discipline,
        stockRisk: riskFrom(c, pgbnnForecast(c).posteriorDays),
        quantity: c.quantity,
        degree: degrees[c.id] || 0
    }));
    return { nodes, edges: trimmed };
}

function pgbnnTrain() {
    const n = Math.max(components.length, 1);
    PG.lossCurve = Array.from({ length: PG.ensemble }, (_, m) => {
        const base = Math.max(0.18, 1.9 - Math.min(1.2, n * 0.06));
        return Number((base * Math.exp(-0.18 * m) + rand01(hash32(`loss-${m}-${n}`)) * 0.08).toFixed(3));
    });
    PG.finalLoss = Number((PG.lossCurve.reduce((s, v) => s + v, 0) / PG.lossCurve.length).toFixed(3));
    PG.trainedAt = new Date().toISOString();
}

function pgbnnHealth() {
    const graph = pgbnnGraph();
    const perClass = PG.features * PG.hidden + PG.hidden + PG.hidden * 3 + 3;
    const perReg = PG.features * PG.hidden + PG.hidden + PG.hidden + 1;
    return {
        ensembleSize: PG.ensemble,
        hiddenNeurons: PG.hidden,
        inputFeatures: PG.features,
        parameters: PG.ensemble * (perClass + perReg),
        epochs: PG.epochs,
        finalLoss: PG.finalLoss,
        trainMillis: 3 + (components.length % 7),
        graphNodes: graph.nodes.length,
        graphEdges: graph.edges.length,
        trainedAt: PG.trainedAt,
        status: PG.status,
        lossCurve: PG.lossCurve
    };
}

function pgbnnPreview(body) {
    const draft = {
        id: 0,
        name: body.name || "",
        specifications: body.specifications || "",
        category: body.category || "",
        region: body.region || "Global",
        quantity: Number(body.quantity) || 0,
        minimumStockLevel: Number(body.minimumStockLevel) || 0,
        monthlyDemand: Number(body.monthlyDemand) || 0,
        leadTimeDays: Number(body.leadTimeDays) || 0,
        unitPrice: Number(body.unitPrice) || 0
    };
    const counts = { EEE: 0, ECE: 0, MECHANICAL: 0 };
    const text = `${draft.name} ${draft.specifications} ${draft.category}`.toLowerCase();
    for (const [domain, words] of Object.entries(CLASSIFICATION_RULES)) {
        counts[domain] = words.filter((w) => text.includes(w)).length;
    }
    if (body.discipline) counts[body.discipline] += 2;
    const smoothed = Object.values(counts).map((v) => v + 0.35);
    const total = smoothed.reduce((s, v) => s + v, 0);
    const probs = Object.keys(counts).map((domain, i) => ({
        domain,
        probabilityPercent: Math.round((smoothed[i] / total) * 1000) / 10
    }));
    const ranked = [...probs].sort((a, b) => b.probabilityPercent - a.probabilityPercent);
    const f = pgbnnForecast(draft);
    const signals = [];
    if (ranked[0].probabilityPercent - ranked[1].probabilityPercent > 25) {
        signals.push(`ensemble separation favors ${ranked[0].domain}`);
    } else {
        signals.push("close call — graph neighbours carry most of the evidence");
    }
    return {
        disciplineProbabilities: probs,
        bestDiscipline: ranked[0].domain,
        neuralConfidencePercent: ranked[0].probabilityPercent,
        ensembleAgreementPercent: f.agreementPercent,
        priorDays: f.priorDays,
        posteriorDays: f.posteriorDays,
        sigmaDays: f.sigmaDays,
        lowerDays: f.lowerDays,
        upperDays: f.upperDays,
        agreementPercent: f.agreementPercent,
        graphSignals: signals
    };
}

pgbnnTrain();

/* ------------------------------ http plumbing --------------------------- */

const MIME = {
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon"
};

function send(res, status, body, type = "application/json; charset=utf-8") {
    const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(payload);
}

function serveTemplate(res, name) {
    const file = join(RES, "templates", `${name}.html`);
    if (!existsSync(file)) return send(res, 404, "Not found", "text/plain");
    send(res, 200, sanitizeTemplate(readFileSync(file, "utf8")), "text/html; charset=utf-8");
}

function readBody(req) {
    return new Promise((done) => {
        let data = "";
        req.on("data", (chunk) => { data += chunk; if (data.length > 1e6) req.destroy(); });
        req.on("end", () => {
            try {
                if (req.headers["content-type"]?.includes("application/x-www-form-urlencoded")) {
                    const params = new URLSearchParams(data);
                    done(Object.fromEntries(params.entries()));
                } else {
                    done(data ? JSON.parse(data) : {});
                }
            } catch {
                done({});
            }
        });
    });
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;
    const method = req.method;

    try {
        if (p === "/" || p === "/dashboard") return serveTemplate(res, "dashboard");
        if (p === "/login") {
            if (method === "POST") { res.writeHead(302, { Location: "/" }); return res.end(); }
            return serveTemplate(res, "login");
        }
        if (p === "/register") {
            if (method === "POST") { res.writeHead(302, { Location: "/login?registered" }); return res.end(); }
            return serveTemplate(res, "register");
        }
        if (p === "/logout") { res.writeHead(302, { Location: "/login?logout" }); return res.end(); }

        if (p === "/api/components" && method === "GET") return send(res, 200, components);
        if (p === "/api/components" && method === "POST") {
            const body = await readBody(req);
            const errors = validateComponent(body);
            if (errors) return send(res, 400, { errors });
            const created = normalize(body);
            components.push(created);
            pgbnnTrain(); // mirrors the engine's fingerprint-triggered retrain
            pushAudit("CREATE", created.id, `Created component ${created.name} (${created.componentCode})`);
            return send(res, 201, created);
        }
        if (p === "/api/components/search" && method === "GET") {
            return send(res, 200, search(url.searchParams.get("q") || ""));
        }
        if (p === "/api/components/recommendations" && method === "GET") {
            return send(res, 200, recommendations({
                componentId: url.searchParams.get("componentId"),
                q: url.searchParams.get("q")
            }));
        }
        const compMatch = p.match(/^\/api\/components\/(\d+)$/);
        if (compMatch) {
            const id = Number(compMatch[1]);
            const idx = components.findIndex((c) => c.id === id);
            if (method === "GET") {
                return idx === -1 ? send(res, 404, { message: "Component not found" }) : send(res, 200, components[idx]);
            }
            if (method === "PUT") {
                if (idx === -1) return send(res, 404, { message: "Component not found" });
                const body = await readBody(req);
                const errors = validateComponent(body);
                if (errors) return send(res, 400, { errors });
                components[idx] = { ...normalize(body, components[idx]), id };
                pgbnnTrain();
                pushAudit("UPDATE", id, `Updated component ${components[idx].name} (${components[idx].componentCode})`);
                return send(res, 200, components[idx]);
            }
            if (method === "DELETE") {
                if (idx === -1) return send(res, 404, { message: "Component not found" });
                const [removed] = components.splice(idx, 1);
                pgbnnTrain();
                pushAudit("DELETE", id, `Deleted component ${removed.name} (${removed.componentCode})`);
                return send(res, 204, "");
            }
        }
        if (p === "/api/ai/classify" && method === "POST") {
            const body = await readBody(req);
            return send(res, 200, classify(body.name, body.specifications, body.categoryHint));
        }
        if (p === "/api/ai/pgbnn/health" && method === "GET") return send(res, 200, pgbnnHealth());
        if (p === "/api/ai/pgbnn/retrain" && method === "POST") {
            pgbnnTrain();
            return send(res, 200, pgbnnHealth());
        }
        if (p === "/api/ai/pgbnn/graph" && method === "GET") return send(res, 200, pgbnnGraph());
        if (p === "/api/ai/pgbnn/preview" && method === "POST") {
            const body = await readBody(req);
            return send(res, 200, pgbnnPreview(body));
        }
        const pgbnnForecastMatch = p.match(/^\/api\/ai\/pgbnn\/forecast\/(\d+)$/);
        if (pgbnnForecastMatch && method === "GET") {
            const c = components.find((x) => x.id === Number(pgbnnForecastMatch[1]));
            if (!c) return send(res, 404, { message: "Component not found" });
            const f = pgbnnForecast(c);
            return send(res, 200, {
                componentId: c.id,
                name: c.name,
                componentCode: c.componentCode,
                discipline: c.discipline,
                ...f,
                risk: riskFrom(c, f.posteriorDays),
                narrative: `Posterior 90% credible band spans ${f.lowerDays.toFixed(1)} to ${f.upperDays.toFixed(1)} days (sigma ${f.sigmaDays.toFixed(1)} days); ensemble mean ${f.neuralMeanDays.toFixed(1)} days, agreement ${f.agreementPercent}%`
            });
        }
        if (p === "/api/analytics/overview" && method === "GET") return send(res, 200, overview());
        if (p === "/api/audit/recent" && method === "GET") {
            const limit = Number(url.searchParams.get("limit") || 20);
            return send(res, 200, audit.slice(0, limit));
        }
        if (p === "/actuator/health") return send(res, 200, { status: "UP (mock preview)" });

        const staticFile = join(RES, "static", p);
        if (staticFile.startsWith(join(RES, "static")) && existsSync(staticFile) && !staticFile.endsWith("/")) {
            return send(res, 200, readFileSync(staticFile), MIME[extname(staticFile)] || "application/octet-stream");
        }

        send(res, 404, "Not found: " + p, "text/plain; charset=utf-8");
    } catch (error) {
        send(res, 500, { message: String(error?.message || error) });
    }
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`⚛ Mock full-stack preview running at http://localhost:${PORT}`);
    console.log("  (dev tool only — real app: mvn spring-boot:run)");
});
