Step 1:
⚙️ Automated Component Management & Tracking System

An ultra-lightweight, zero-dependency REST API and web dashboard engineered to streamline the tracking and lifecycle management of industrial components (e.g., Microcontrollers, Sensors, Silicon Quads) within engineering and lab environments.

🚀 Overview

This project provides a robust solution for real-time inventory tracking without the overhead of heavy enterprise frameworks. Built strictly using core Java (`com.sun.net.httpserver`) and vanilla web languages, this system serves both the backend logic and the frontend user interface from a single, highly efficient local server. 

It was designed specifically to handle the inventory demands of hardware projects, allowing engineers to dynamically track stock levels, categorize components (such as those used in wind turbine telemetry or IoT devices), and receive automated low-stock warnings.

Key Engineering Features:
* Zero-Dependency Architecture:Bypasses heavy frameworks (like Spring Boot) or external database dependencies, utilizing Java's core networking libraries and manual JSON serialization.
* In-Memory Database: Utilizes a highly responsive, custom in-memory data model for sub-millisecond component retrieval and updates.
* Automated Stock Evaluation: Programmatic logic constantly evaluates component quantities, automatically flagging specific UI elements when critical stock thresholds are breached.
* Single-Node Deployment: The backend seamlessly serves static HTML/CSS alongside the REST API endpoints, allowing for immediate deployment on any machine with a JVM.

🛠️ Technology Stack
* Backend:Core Java 11+ (`HttpServer`, `HttpHandler`, `HttpExchange`)
* Frontend:Vanilla JavaScript (ES6+), HTML5, CSS3
* API Protocol: Custom REST endpoints (`GET`, `POST`) with manual string-parsing for zero-dependency JSON handling.

 📸 Dashboard Interface
*The dashboard provides a clean, technical layout suitable for an industrial control room or university lab.*

*  Real-time Stock Grid:Displays Component IDs, Categories, Stock Levels, and dynamic Status badges.
*  Rapid Entry Form: Allows for instant logging of new acquisitions (e.g., newly arrived ESP32 modules or anemometers).

💻 How to Run (Local Deployment)

Because this system requires absolutely no external libraries or database configurations, it can be booted up in seconds.

1. Ensure you have Java installed on your machine.


Step 2 :

Compile the Java Server : javac InventoryServer.java

Step 3:

Run the application: Java InventoryServer

Step 4 :

5. Open your web browser and navigate to the live dashboard at: **`http://localhost:8080`**

🔮 Roadmap & Future Scope
* Hardware Integration: Transitioning the manual entry system to accept automated HTTP `POST` requests directly from ESP32 barcode/RFID scanners.
* Predictive Maintenance: Integrating a basic machine learning model to track component consumption rates and predict future depletion dates for critical hardware.
* Persistent Storage: Moving the in-memory database to a lightweight SQLite file for long-term data retention without sacrificing the low-dependency footprint.

👨‍💻 About the Developer
Rajaram Kuttalingam Pillai
EEE Undergraduate & AI-Hardware Systems Engineer

This project serves as a foundational building block for broader industrial automation goals, specifically aiming to merge AI diagnostics with renewable energy infrastructure (such as wind turbine predictive maintenance).
2. Clone this repository and navigate to the project directory in your terminal:
   ```bash
   cd Automated-Component-Management
