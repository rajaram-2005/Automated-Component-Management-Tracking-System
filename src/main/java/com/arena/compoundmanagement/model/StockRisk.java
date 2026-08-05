package com.arena.compoundmanagement.model;

public enum StockRisk {
    LOW(1, "Low"),
    MODERATE(2, "Moderate"),
    HIGH(3, "High"),
    CRITICAL(4, "Critical");

    private final int severity;
    private final String label;

    StockRisk(int severity, String label) {
        this.severity = severity;
        this.label = label;
    }

    public int getSeverity() {
        return severity;
    }

    public String getLabel() {
        return label;
    }
}
