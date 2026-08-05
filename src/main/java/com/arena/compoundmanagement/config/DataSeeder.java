package com.arena.compoundmanagement.config;

import com.arena.compoundmanagement.model.AppUser;
import com.arena.compoundmanagement.model.EngineeringComponent;
import com.arena.compoundmanagement.model.EngineeringDomain;
import com.arena.compoundmanagement.model.Role;
import com.arena.compoundmanagement.repository.AppUserRepository;
import com.arena.compoundmanagement.repository.ComponentRepository;
import com.arena.compoundmanagement.service.ClassificationService;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class DataSeeder implements ApplicationRunner {

    private final AppUserRepository appUserRepository;
    private final ComponentRepository componentRepository;
    private final PasswordEncoder passwordEncoder;
    private final ClassificationService classificationService;

    public DataSeeder(AppUserRepository appUserRepository,
                      ComponentRepository componentRepository,
                      PasswordEncoder passwordEncoder,
                      ClassificationService classificationService) {
        this.appUserRepository = appUserRepository;
        this.componentRepository = componentRepository;
        this.passwordEncoder = passwordEncoder;
        this.classificationService = classificationService;
    }

    @Override
    public void run(ApplicationArguments args) {
        seedUsers();
        seedComponents();
    }

    private void seedUsers() {
        if (appUserRepository.count() > 0) {
            return;
        }

        appUserRepository.save(buildUser("Admin Engineer", "admin", "admin@compound.ai", "admin123", Role.ADMIN));
        appUserRepository.save(buildUser("Global Engineer", "engineer", "engineer@compound.ai", "engineer123", Role.ENGINEER));
    }

    private AppUser buildUser(String fullName, String username, String email, String password, Role role) {
        AppUser user = new AppUser();
        user.setFullName(fullName);
        user.setUsername(username);
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setRole(role);
        return user;
    }

    private void seedComponents() {
        if (componentRepository.count() > 0) {
            return;
        }

        componentRepository.save(component("ECE-ESP3-A1B2C3", "ESP32-WROOM-32 MCU", EngineeringDomain.ECE,
                "Embedded & IoT Controllers", "Wireless MCU", "Asia-Pacific", "Espressif",
                "Dual-core Wi-Fi and Bluetooth microcontroller, 3.3V, 240MHz, UART SPI I2C, OTA capable",
                72, 25, 18, 21, 4.90));

        componentRepository.save(component("EEE-IGBT-P4D5E6", "3-Phase IGBT Power Module", EngineeringDomain.EEE,
                "Power Electronics", "Inverter Switching", "Europe", "Infineon",
                "600V 50A inverter switching module for motor drives and industrial converters",
                14, 12, 6, 35, 48.00));

        componentRepository.save(component("EEE-HALL-Q7R8S9", "Hall Effect Current Sensor ACS758", EngineeringDomain.EEE,
                "Sensors & Instrumentation", "Current Measurement", "North America", "Allegro",
                "50A bidirectional current sensor with isolation-friendly Hall effect measurement",
                33, 10, 7, 14, 8.10));

        componentRepository.save(component("ECE-LORA-L1M2N3", "LoRa SX1278 Transceiver Module", EngineeringDomain.ECE,
                "Communication Modules", "RF Telemetry", "Asia-Pacific", "Semtech",
                "433MHz RF transceiver module for long-range telemetry, SPI interface, low-power operation",
                41, 15, 9, 18, 7.40));

        componentRepository.save(component("ECE-FPGA-F4G5H6", "FPGA Development Board Artix-7", EngineeringDomain.ECE,
                "Digital Logic & Prototyping", "Programmable Logic", "Europe", "AMD Xilinx",
                "Artix-7 FPGA board with DDR3, Ethernet, GPIO and prototyping support for digital systems",
                9, 6, 2, 42, 165.00));

        componentRepository.save(component("EEE-BLDC-B7C8D9", "BLDC Motor Driver", EngineeringDomain.EEE,
                "Drives & Motion Control", "Motor Control", "Asia-Pacific", "Texas Instruments",
                "48V 30A field-oriented control driver for BLDC motors with current feedback support",
                17, 8, 5, 28, 39.90));

        componentRepository.save(component("MEC-BEAR-E1F2G3", "Deep Groove Ball Bearing 6204", EngineeringDomain.MECHANICAL,
                "Bearings & Motion", "Rotary Bearing", "Europe", "SKF",
                "20mm ID, 47mm OD sealed bearing for rotary systems, low friction, industrial duty",
                120, 40, 20, 12, 6.20));

        componentRepository.save(component("MEC-PNEU-H4J5K6", "Pneumatic Cylinder ISO 15552", EngineeringDomain.MECHANICAL,
                "Fluid Power & Actuation", "Cylinder", "North America", "Festo",
                "Double acting pneumatic cylinder, 32mm bore, 100mm stroke, automation line ready",
                11, 8, 3, 30, 79.00));

        componentRepository.save(component("MEC-PULL-L7M8N9", "Aluminium Timing Pulley GT2", EngineeringDomain.MECHANICAL,
                "Mechanical Power Transmission", "Pulley", "Asia-Pacific", "Gates",
                "20 tooth GT2 timing pulley for automation, CNC positioning and belt transmission assemblies",
                64, 18, 11, 16, 12.50));

        componentRepository.save(component("MEC-FAST-P1Q2R3", "Stainless Steel Fastener Kit M6", EngineeringDomain.MECHANICAL,
                "Fasteners & Fabrication", "Fasteners", "Global", "Bosch Rexroth",
                "A2 stainless bolts, nuts and washers for enclosure, frame and fabrication assemblies",
                205, 60, 35, 10, 0.35));

        componentRepository.save(component("ECE-IMU-S4T5U6", "MEMS IMU 9-DOF Sensor", EngineeringDomain.ECE,
                "Sensors & Instrumentation", "Motion Sensor", "Asia-Pacific", "Bosch",
                "Accelerometer gyroscope magnetometer combo with I2C/SPI support for robotics and drones",
                28, 12, 8, 20, 11.80));

        componentRepository.save(component("EEE-PLC-V7W8X9", "Programmable Logic Controller Relay Module", EngineeringDomain.EEE,
                "Industrial Control", "Relay Interface", "Europe", "Siemens",
                "24V DIN rail relay interface with 4-channel output for PLC driven industrial control panels",
                23, 10, 4, 24, 29.00));
    }

    private EngineeringComponent component(String code,
                                           String name,
                                           EngineeringDomain domain,
                                           String category,
                                           String subCategory,
                                           String region,
                                           String manufacturer,
                                           String specifications,
                                           int quantity,
                                           int minimumStockLevel,
                                           double monthlyDemand,
                                           int leadTimeDays,
                                           double unitPrice) {
        EngineeringComponent component = new EngineeringComponent();
        ClassificationService.ClassificationOutcome outcome = classificationService.classify(name, specifications, category);
        component.setComponentCode(code);
        component.setName(name);
        component.setDiscipline(domain);
        component.setCategory(category);
        component.setSubCategory(subCategory);
        component.setRegion(region);
        component.setManufacturer(manufacturer);
        component.setSpecifications(specifications);
        component.setQuantity(quantity);
        component.setMinimumStockLevel(minimumStockLevel);
        component.setMonthlyDemand(monthlyDemand);
        component.setLeadTimeDays(leadTimeDays);
        component.setUnitPrice(unitPrice);
        component.setClassificationConfidence(outcome.confidence());
        return component;
    }
}
