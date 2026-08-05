package com.arena.compoundmanagement.service;

import com.arena.compoundmanagement.model.EngineeringDomain;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

@Service
public class ClassificationService {

    private static final Pattern NON_ALPHANUMERIC = Pattern.compile("[^a-z0-9+ ]");

    private final Map<EngineeringDomain, List<String>> domainSignals = Map.of(
            EngineeringDomain.EEE, List.of(
                    "transformer", "motor", "drive", "power", "voltage", "current", "relay",
                    "inverter", "converter", "switchgear", "contactor", "battery", "bldc",
                    "igbt", "thyristor", "ac", "dc", "plc", "protection"
            ),
            EngineeringDomain.ECE, List.of(
                    "microcontroller", "rf", "transceiver", "sensor", "antenna", "uart", "spi",
                    "i2c", "fpga", "bluetooth", "wifi", "gsm", "lora", "adc", "dac",
                    "op amp", "pcb", "iot", "embedded", "logic"
            ),
            EngineeringDomain.MECHANICAL, List.of(
                    "bearing", "gear", "shaft", "pulley", "coupling", "fastener", "torque",
                    "pneumatic", "hydraulic", "valve", "actuator", "alloy", "steel", "cad",
                    "weld", "seal", "belt", "spring", "cylinder", "fabrication"
            )
    );

    private final Map<String, List<String>> categorySignals = Map.ofEntries(
            Map.entry("Power Electronics", List.of("igbt", "mosfet", "converter", "inverter", "thyristor", "rectifier", "dc bus")),
            Map.entry("Industrial Control", List.of("plc", "relay", "contactor", "switchgear", "control panel", "din rail")),
            Map.entry("Drives & Motion Control", List.of("bldc", "servo", "drive", "motor control", "vfd", "foc")),
            Map.entry("Embedded & IoT Controllers", List.of("microcontroller", "esp32", "stm32", "arduino", "embedded", "iot")),
            Map.entry("Communication Modules", List.of("rf", "lora", "gsm", "modem", "transceiver", "antenna", "ethernet")),
            Map.entry("Digital Logic & Prototyping", List.of("fpga", "logic", "verilog", "vhdl", "breadboard", "gpio")),
            Map.entry("Sensors & Instrumentation", List.of("sensor", "imu", "thermistor", "pressure", "current sensing", "instrumentation", "hall effect")),
            Map.entry("Bearings & Motion", List.of("bearing", "linear guide", "roller", "shaft", "rotary")),
            Map.entry("Mechanical Power Transmission", List.of("gear", "pulley", "belt", "coupling", "sprocket", "transmission")),
            Map.entry("Fluid Power & Actuation", List.of("pneumatic", "hydraulic", "cylinder", "valve", "compressor", "actuator")),
            Map.entry("Fasteners & Fabrication", List.of("fastener", "bolt", "nut", "washer", "steel", "fabrication", "bracket"))
    );

    public ClassificationOutcome classify(String name, String specifications, String categoryHint) {
        String normalizedName = normalize(name);
        String normalizedSpecs = normalize(specifications);
        String normalizedHint = normalize(categoryHint);
        String combined = String.join(" ", normalizedName, normalizedSpecs, normalizedHint).trim();

        Map<EngineeringDomain, Integer> domainScores = new LinkedHashMap<>();
        List<String> matchedSignals = new ArrayList<>();
        for (Map.Entry<EngineeringDomain, List<String>> entry : domainSignals.entrySet()) {
            int score = scoreSignals(normalizedName, normalizedSpecs, normalizedHint, entry.getValue(), matchedSignals);
            domainScores.put(entry.getKey(), score);
        }

        Map<String, Integer> categoryScores = new LinkedHashMap<>();
        for (Map.Entry<String, List<String>> entry : categorySignals.entrySet()) {
            int score = scoreSignals(normalizedName, normalizedSpecs, normalizedHint, entry.getValue(), matchedSignals);
            categoryScores.put(entry.getKey(), score);
        }

        EngineeringDomain predictedDomain = domainScores.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .filter(entry -> entry.getValue() > 0)
                .map(Map.Entry::getKey)
                .orElseGet(() -> inferDomainFromCategory(normalizedHint));

        String predictedCategory = categoryScores.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .filter(entry -> entry.getValue() > 0)
                .map(Map.Entry::getKey)
                .orElse(defaultCategoryFor(predictedDomain));

        double domainTotal = domainScores.values().stream().mapToInt(Integer::intValue).sum();
        double categoryTotal = categoryScores.values().stream().mapToInt(Integer::intValue).sum();
        double topDomainScore = domainScores.getOrDefault(predictedDomain, 0);
        double topCategoryScore = categoryScores.getOrDefault(predictedCategory, 0);
        double confidence = round(
                ((domainTotal == 0 ? 0.45 : topDomainScore / Math.max(domainTotal, 1.0))
                        + (categoryTotal == 0 ? 0.45 : topCategoryScore / Math.max(categoryTotal, 1.0))) / 2.0 * 100.0
        );

        if (matchedSignals.isEmpty() && !combined.isBlank()) {
            matchedSignals.add("generic engineering terminology");
        }

        matchedSignals = matchedSignals.stream()
                .filter(Objects::nonNull)
                .distinct()
                .sorted(Comparator.naturalOrder())
                .limit(6)
                .toList();

        return new ClassificationOutcome(predictedDomain, predictedCategory, confidence, matchedSignals);
    }

    private int scoreSignals(String normalizedName,
                             String normalizedSpecs,
                             String normalizedHint,
                             List<String> signals,
                             List<String> matchedSignals) {
        int score = 0;
        for (String signal : signals) {
            if (normalizedName.contains(signal)) {
                score += 5;
                matchedSignals.add(signal);
            }
            if (normalizedSpecs.contains(signal)) {
                score += 3;
                matchedSignals.add(signal);
            }
            if (!normalizedHint.isBlank() && normalizedHint.contains(signal)) {
                score += 4;
                matchedSignals.add(signal);
            }
        }
        return score;
    }

    private EngineeringDomain inferDomainFromCategory(String normalizedHint) {
        if (normalizedHint.contains("mechanical") || normalizedHint.contains("bearing") || normalizedHint.contains("gear")) {
            return EngineeringDomain.MECHANICAL;
        }
        if (normalizedHint.contains("communication") || normalizedHint.contains("embedded") || normalizedHint.contains("sensor")) {
            return EngineeringDomain.ECE;
        }
        return EngineeringDomain.EEE;
    }

    private String defaultCategoryFor(EngineeringDomain domain) {
        return switch (domain) {
            case EEE -> "Industrial Control";
            case ECE -> "Embedded & IoT Controllers";
            case MECHANICAL -> "Mechanical Power Transmission";
        };
    }

    private double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private String normalize(String value) {
        if (value == null) {
            return "";
        }
        return NON_ALPHANUMERIC.matcher(value.toLowerCase(Locale.ROOT)).replaceAll(" ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    public record ClassificationOutcome(
            EngineeringDomain discipline,
            String category,
            double confidence,
            List<String> matchedSignals
    ) {
    }
}
