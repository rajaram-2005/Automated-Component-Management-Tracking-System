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
                pushAudit("UPDATE", id, `Updated component ${components[idx].name} (${components[idx].componentCode})`);
                return send(res, 200, components[idx]);
            }
            if (method === "DELETE") {
                if (idx === -1) return send(res, 404, { message: "Component not found" });
                const [removed] = components.splice(idx, 1);
                pushAudit("DELETE", id, `Deleted component ${removed.name} (${removed.componentCode})`);
                return send(res, 204, "");
            }
        }
        if (p === "/api/ai/classify" && method === "POST") {
            const body = await readBody(req);
            return send(res, 200, classify(body.name, body.specifications, body.categoryHint));
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
