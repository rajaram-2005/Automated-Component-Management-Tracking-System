# Compound Management System

A Spring Boot web application for managing engineering components across **Electrical & Electronics Engineering (EEE)**, **Electronics & Communication Engineering (ECE)**, and **Mechanical Engineering**. The system combines secure authentication, CRUD inventory workflows, NLP-inspired search, AI-assisted classification, and predictive stock analytics in a responsive HTML/CSS dashboard.

## Highlights

- **Spring Boot + Thymeleaf** full-stack application
- **User authentication** with registration, login, logout, and BCrypt password hashing
- **CRUD operations** for global engineering components
- **Natural-language search** across names, disciplines, specs, regions, and stock intent
- **Automated classification** of components using rule-based AI signals from specifications
- **Recommendation engine** for related and high-availability parts
- **Predictive analytics** for stockout risk and availability confidence
- **Responsive UI** built with HTML, CSS, and vanilla JavaScript
- **H2 database** persistence for users and components

## Tech Stack

- Java 17
- Spring Boot 3.3.x
- Spring Web
- Spring Security
- Spring Data JPA
- Thymeleaf
- H2 Database
- HTML, CSS, Vanilla JavaScript

## AI / ML-Inspired Features

This project includes practical, explainable intelligence features that work without external model hosting:

1. **Automated Classification**
   - Predicts engineering discipline and category from component name + specifications
   - Produces confidence score and matched signals

2. **Natural Language Search**
   - Parses user intent from queries like:
     - `show low stock ECE communication modules from Asia`
     - `find mechanical bearings with high availability`
     - `recommend power electronics for motor control`
   - Uses keyword normalization, token overlap, region detection, stock intent, and quantity hints

3. **Recommendation Engine**
   - Suggests similar or complementary components
   - Considers domain similarity, category affinity, specifications overlap, and forecasted availability

4. **Predictive Availability Analytics**
   - Estimates days-to-stockout from inventory, monthly demand, and lead time
   - Generates availability confidence and stock-risk labels

## Default Accounts

Seeded demo users:

- **Admin**: `admin` / `admin123`
- **Engineer**: `engineer` / `engineer123`

You can also register a new engineer account from the `/register` page.

## Project Structure

```text
src/main/java/com/arena/compoundmanagement
├── config
├── controller
├── dto
├── model
├── repository
└── service

src/main/resources
├── static
│   ├── css/main.css
│   └── js/app.js
├── templates
│   ├── dashboard.html
│   ├── login.html
│   └── register.html
└── application.properties
```

## Run Locally

### Prerequisites

- Java 17+
- Maven 3.9+

### Start the application

```bash
mvn spring-boot:run
```

Then open:

- Dashboard: `http://localhost:8080/`
- Login: `http://localhost:8080/login`
- Register: `http://localhost:8080/register`
- H2 Console: `http://localhost:8080/h2-console`

### H2 Console settings

- JDBC URL: `jdbc:h2:file:./data/compounddb`
- Username: `sa`
- Password: *(leave blank)*

## REST API Overview

### Components

- `GET /api/components`
- `GET /api/components/{id}`
- `POST /api/components`
- `PUT /api/components/{id}`
- `DELETE /api/components/{id}`
- `GET /api/components/search?q=...`
- `GET /api/components/recommendations?componentId=...`
- `GET /api/components/recommendations?q=...`

### AI / Analytics

- `POST /api/ai/classify`
- `GET /api/analytics/overview`

## Sample Component Payload

```json
{
  "name": "LoRa SX1278 Transceiver Module",
  "discipline": "ECE",
  "category": "Communication Modules",
  "subCategory": "RF Telemetry",
  "region": "Asia-Pacific",
  "manufacturer": "Semtech",
  "specifications": "433MHz RF transceiver module, SPI interface, low-power telemetry",
  "quantity": 41,
  "minimumStockLevel": 15,
  "monthlyDemand": 9,
  "leadTimeDays": 18,
  "unitPrice": 7.4
}
```

## Notes

- The application seeds a representative cross-domain catalog on first launch.
- Forecasting and recommendation logic is intentionally transparent and explainable.
- Security is session-based and suitable for a demo or academic project foundation.

## Future Enhancements

- Role-based admin approvals and audit trails
- Supplier integrations and purchase-order workflows
- External ML model integration for richer demand forecasting
- Export/import pipelines for ERP and lab systems
