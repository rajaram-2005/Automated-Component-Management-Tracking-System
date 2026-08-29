# Compound Management System

A Spring Boot web application for managing engineering components across **Electrical & Electronics Engineering (EEE)**, **Electronics & Communication Engineering (ECE)**, and **Mechanical Engineering**. The system combines secure authentication, CRUD inventory workflows, NLP-inspired search, AI-assisted classification, recommendation logic, predictive stock analytics, and an audit trail in a modern, responsive HTML/CSS/JS dashboard.

## Highlights

- **Spring Boot 3.5 + Thymeleaf** full-stack application
- **User authentication** with registration, login, logout, and BCrypt password hashing
- **CRUD operations** for global engineering components with an **audit/activity log**
- **Natural-language search** across names, disciplines, specs, regions, and stock intent
- **Automated classification** of components using rule-based AI signals from specifications
- **Recommendation engine** for related and high-availability parts
- **PG-BNN neural engine** — Probabilistic Graph Bayesian Neural Network: an 8-member MLP ensemble over a component affinity graph, fused with the inventory-physics prior into calibrated posteriors with 90% credible bands (new panel, new REST endpoints, live in the wizard)
- **Predictive analytics** for stockout risk and availability confidence
- **New colorful UI** ("Aurora Industrial"): gradient glass panels, discipline color coding (ECE violet, EEE amber, Mechanical teal), animated gradient CTAs, KPI cards with tone-matched glows, and a live stock-risk meter
- **Guided 4-step component form** (the new form): Identity → Classification (inline AI preview) → Inventory & Forecast (live risk meter) → Review, with per-step validation and one-click create/update against the REST API
- **Modern, responsive UX**: light/dark theme toggle, keyboard command palette (**⌘K**), press **N** to launch the new component form, catalog filters, CSV export, donut chart, animated counters, and loading skeletons
- **Smooth scrolling by design**: sticky compacting topbar, top scroll-progress line, floating ↑/↓ scroll controls, scroll-lock without layout shift (`scrollbar-gutter`), and a scroll-jank budget that keeps `backdrop-filter` and infinite animations off scrolling surfaces (aurora background lives on fixed compositor layers)
- **Pointer-scroll everywhere**: wheel scrolling works anywhere inside the component wizard (header, footer, even the dimmed margins forward to the form), and sign-in / sign-up pages scroll normally on short windows — the old `overflow: hidden` body lock is replaced by `align-content: safe center` + fixed decorative orbs, so a five-field register form can never be clipped out of reach
- **H2 database** (default, zero-setup) with an optional **PostgreSQL** production profile
- **Actuator** health/info endpoints, graceful shutdown, and a GitHub Actions CI pipeline

## Tech Stack

- Java 17
- Spring Boot 3.5.16
- Spring Web
- Spring Security
- Spring Data JPA
- Spring Boot Actuator
- Thymeleaf
- H2 Database (dev) / PostgreSQL (prod via `prod` profile)
- HTML, CSS, Vanilla JavaScript (no external JS/CDN dependencies)

## AI / ML-Inspired Features

This project includes practical, explainable intelligence features that work without external model hosting:

1. **Automated Classification** — predicts engineering discipline and category from component name + specifications, producing a confidence score and matched signals.
2. **Natural Language Search** — parses user intent from queries like:
   - `show low stock ECE communication modules from Asia`
   - `find mechanical bearings with high availability`
   - `recommend power electronics for motor control`
   Uses keyword normalization, token overlap, region detection, stock intent, and quantity hints.
3. **Recommendation Engine** — suggests similar or complementary components based on domain similarity, category affinity, specifications overlap, and forecasted availability.
4. **Predictive Availability Analytics** — estimates days-to-stockout from inventory, monthly demand, and lead time, then generates availability confidence and stock-risk labels.
5. **PG-BNN (Probabilistic Graph Bayesian Neural Network)** — the "epic" engine, pure Java, deterministic seeds, zero external dependencies:
   - **Neural layer** — an ensemble of eight 61→24→3 (discipline softmax) + 61→24→1 (log days-to-stockout) MLPs trained by SGD/backprop on the live catalog; each member sees a seeded bootstrap sample, so member spread is a usable epistemic-uncertainty signal.
   - **Bayesian layer** — the ensemble mean/std forms a Gaussian likelihood which is conjugate-fused with the deterministic inventory-physics model (the `AnalyticsService` math) treated as the prior; outputs always ship a posterior + σ + 90% credible band, never a naked point estimate.
   - **Graph layer** — components link via token/category/region/quantity affinity; classification posteriors are refined by damped label propagation, so ambiguous parts inherit evidence from neighbours. The graph is rendered live in the dashboard's PGBNN panel (animated, click-a-node to inspect).
   - **Endpoints** — `GET /api/ai/pgbnn/health | /graph | /forecast/{id}`, `POST /api/ai/pgbnn/preview | /retrain`. The engine retrains lazily whenever the catalog fingerprint changes; untrained/degraded states fall back to the wide-band analytic prior. The wizard's Inventory step streams draft previews into `POST /preview` so you see the posterior band *while typing*.

## Default Accounts

Seeded demo users:

- **Admin**: `admin` / `admin123`
- **Engineer**: `engineer` / `engineer123`

You can also register a new engineer account from the `/register` page.

## Project Structure

```text
src/main/java/com/arena/compoundmanagement
├── config        # Security, data seeder
├── controller    # Web & REST controllers (incl. PgbnnController for the neural engine)
├── dto           # Request/response records (incl. Pgbnn* responses)
├── model         # JPA entities + enums
├── repository    # Spring Data repositories
└── service       # Business logic (analytics, search, classification, recommendation, audit,
                  # PgbnnEngine + PgbnnService — the graph-Bayesian neural layer)
```

```text
src/main/resources
├── static
│   ├── css/main.css      # "Aurora Industrial" design system (dark + light themes)
│   └── js/app.js         # dashboard + 4-step wizard controller (consumes the REST API)
├── templates     # dashboard (with wizard), login, register
├── application.properties      # default (H2)
└── application-prod.properties # prod profile (PostgreSQL)
```

```text
scripts/
├── verify.sh      # one-shot build + test verification (needs JDK 17 + Maven)
└── preview.mjs    # JVM-free UI preview with a mock of the full REST API (Node 18+)
```

## Run Locally

### Prerequisites

- Java 17+
- Maven 3.9+

### Start the application (H2)

```bash
mvn spring-boot:run
```

Then open:

- Dashboard: `http://localhost:8080/`
- Login: `http://localhost:8080/login`
- Register: `http://localhost:8080/register`
- H2 Console: `http://localhost:8080/h2-console`
- Health: `http://localhost:8080/actuator/health`

### Preview the UI without a JVM

The redesigned frontend (colorful dashboard + 4-step wizard form) can be reviewed with a
mock of the Spring Boot API — same routes and JSON shapes — served by Node alone:

```bash
node scripts/preview.mjs   # http://localhost:8080 (in-memory data, resets on restart)
```

This is a dev tool for UI iteration only; run `mvn spring-boot:run` for the real full-stack app.

### Run the tests

```bash
mvn test
# or with a full build (tests + packaging)
mvn verify
```

## Production / PostgreSQL

Use the provided Docker Compose stack (PostgreSQL + app):

```bash
docker compose up --build
```

The app runs with the `prod` profile, connecting to the bundled PostgreSQL container. Admin-only users can reach the actuator endpoints beyond `/actuator/health`.

Alternatively, run against your own PostgreSQL:

```bash
export SPRING_PROFILES_ACTIVE=prod
export DB_URL=jdbc:postgresql://localhost:5432/compounddb
export DB_USERNAME=compound
export DB_PASSWORD=compound
mvn spring-boot:run
```

## Build & Test Verification

Run the one-shot, self-contained verification script (it checks for JDK 17+ and
Maven, then runs a clean build + all tests — no hosted CI needed):

```bash
./scripts/verify.sh
```

Or run Maven directly:

```bash
mvn clean verify        # compile + tests
mvn test                # tests only
```

The build uses an isolated in-memory H2 for tests (via `src/test/resources/application.properties`), so `mvn verify` needs no external database.

### JavaScript / template sanity (no JVM required)

```bash
node --check src/main/resources/static/js/app.js          # JS syntax
node --check scripts/preview.mjs                          # preview tool syntax
```

A GitHub Actions workflow (build, test, package, Docker image on pushes/PRs to `master`/`main`) is also documented in [`docs/github-actions-ci.md`](docs/github-actions-ci.md). It is intentionally **not** shipped as a live `.github/workflows/ci.yml` because the automation token used to publish this branch lacks the GitHub **Workflows** permission; add the file with the contents from that doc (and a token with `workflows: write`) to enable it.
