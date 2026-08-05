package com.arena.compoundmanagement.dto;

import com.arena.compoundmanagement.model.EngineeringDomain;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public class ComponentRequest {

    private String componentCode;

    @NotBlank(message = "Component name is required")
    @Size(max = 200, message = "Component name is too long")
    private String name;

    private EngineeringDomain discipline;

    private String category;

    @Size(max = 120, message = "Sub-category is too long")
    private String subCategory;

    @NotBlank(message = "Region is required")
    private String region;

    @Size(max = 120, message = "Manufacturer is too long")
    private String manufacturer;

    @Size(max = 2500, message = "Specifications are too long")
    private String specifications;

    @NotNull(message = "Quantity is required")
    @Min(value = 0, message = "Quantity cannot be negative")
    private Integer quantity;

    @NotNull(message = "Minimum stock level is required")
    @Min(value = 0, message = "Minimum stock level cannot be negative")
    private Integer minimumStockLevel;

    @NotNull(message = "Monthly demand is required")
    @DecimalMin(value = "0.0", inclusive = true, message = "Monthly demand cannot be negative")
    private Double monthlyDemand;

    @NotNull(message = "Lead time is required")
    @Min(value = 0, message = "Lead time cannot be negative")
    private Integer leadTimeDays;

    @NotNull(message = "Unit price is required")
    @DecimalMin(value = "0.0", inclusive = true, message = "Unit price cannot be negative")
    private Double unitPrice;

    public String getComponentCode() {
        return componentCode;
    }

    public void setComponentCode(String componentCode) {
        this.componentCode = componentCode;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public EngineeringDomain getDiscipline() {
        return discipline;
    }

    public void setDiscipline(EngineeringDomain discipline) {
        this.discipline = discipline;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getSubCategory() {
        return subCategory;
    }

    public void setSubCategory(String subCategory) {
        this.subCategory = subCategory;
    }

    public String getRegion() {
        return region;
    }

    public void setRegion(String region) {
        this.region = region;
    }

    public String getManufacturer() {
        return manufacturer;
    }

    public void setManufacturer(String manufacturer) {
        this.manufacturer = manufacturer;
    }

    public String getSpecifications() {
        return specifications;
    }

    public void setSpecifications(String specifications) {
        this.specifications = specifications;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public Integer getMinimumStockLevel() {
        return minimumStockLevel;
    }

    public void setMinimumStockLevel(Integer minimumStockLevel) {
        this.minimumStockLevel = minimumStockLevel;
    }

    public Double getMonthlyDemand() {
        return monthlyDemand;
    }

    public void setMonthlyDemand(Double monthlyDemand) {
        this.monthlyDemand = monthlyDemand;
    }

    public Integer getLeadTimeDays() {
        return leadTimeDays;
    }

    public void setLeadTimeDays(Integer leadTimeDays) {
        this.leadTimeDays = leadTimeDays;
    }

    public Double getUnitPrice() {
        return unitPrice;
    }

    public void setUnitPrice(Double unitPrice) {
        this.unitPrice = unitPrice;
    }
}
