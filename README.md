# Compound Management System

A Spring Boot web application for managing engineering components across **Electrical & Electronics Engineering (EEE)**, **Electronics & Communication Engineering (ECE)**, and **Mechanical Engineering**. The system combines secure authentication, CRUD inventory workflows, NLP-inspired search, AI-assisted classification, recommendation logic, predictive stock analytics, and an audit trail in a modern, responsive HTML/CSS/JS dashboard.

## Highlights

- **Spring Boot 3.5 + Thymeleaf** full-stack application
- **User authentication** with registration, login, logout, and BCrypt password hashing
- **CRUD operations** for global engineering components with an **audit/activity log**
- **Natural-language search** across names, disciplines, specs, regions, and stock intent
- **Automated classification** of components using rule-based AI signals from specifications
- **Recommendation engine** for related and high-availability parts
- **Predictive analytics** for stockout risk and availability confidence
- **Modern, responsive UI**: light/dark theme toggle, keyboard command palette (**⌘K**), catalog filters, CSV export, donut chart, animated counters, and loading skeletons
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

## Default Accounts

Seeded demo users:

- **Admin**: `admin` / `admin123`
- **Engineer**: `engineer` / `engineer123`

You can also register a new engineer account from the `/register` page.

## Project Structure

```text
src/main/java/com/arena/compoundmanagement
├── config        # Security, data seeder
├── controller    # Web & REST controllers
├── dto           # Request/response records
├── model         # JPA entities + enums
├── repository    # Spring Data repositories
└── service       # Business logic (analytics, search, classification, recommendation, audit)
```

```text
src/main/resources
├── static
│   ├── css/main.css
│   └── js/app.js
├── templates     # dashboard, login, register
├── application.properties      # default (H2)
└── application-prod.properties # prod profile (PostgreSQL)
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
```

A GitHub Actions workflow (build, test, package, Docker image on pushes/PRs to `master`/`main`) is also documented in [`docs/github-actions-ci.md`](docs/github-actions-ci.md). It is intentionally **not** shipped as a live `.github/workflows/ci.yml` because the automation token used to publish this branch lacks the GitHub **Workflows** permission; add the file with the contents from that doc (and a token with `workflows: write`) to enable it.
