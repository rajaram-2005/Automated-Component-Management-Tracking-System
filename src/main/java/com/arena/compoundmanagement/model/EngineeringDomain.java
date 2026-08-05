package com.arena.compoundmanagement.model;

public enum EngineeringDomain {
    EEE("Electrical and Electronics Engineering"),
    ECE("Electronics and Communication Engineering"),
    MECHANICAL("Mechanical Engineering");

    private final String displayName;

    EngineeringDomain(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
