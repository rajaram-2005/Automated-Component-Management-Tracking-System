package com.arena.compoundmanagement.service;

import com.arena.compoundmanagement.dto.AnalyticsOverviewResponse;
import com.arena.compoundmanagement.model.EngineeringComponent;
import com.arena.compoundmanagement.model.StockRisk;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class AnalyticsService {

    public ComponentForecast forecast(EngineeringComponent component) {
        double demand = Math.max(component.getMonthlyDemand(), 0.1d);
        double daysToStockout = component.getQuantity() <= 0 ? 0 : (component.getQuantity() / demand) * 30.0;
        double projectedQuantityAfterLeadTime = component.getQuantity() - (demand * (component.getLeadTimeDays() / 30.0));
        double bufferRatio = (projectedQuantityAfterLeadTime - component.getMinimumStockLevel()) / Math.max(component.getMinimumStockLevel(), 1);
        double probability = clamp((sigmoid(bufferRatio) * 85.0) + 10.0, 5.0, 99.0);
        StockRisk stockRisk = resolveRisk(component, daysToStockout);

        String narrative = switch (stockRisk) {
            case CRITICAL -> "Projected depletion is inside supplier lead time. Trigger replenishment immediately.";
            case HIGH -> "Stock is vulnerable to near-term demand spikes. Plan replenishment soon.";
            case MODERATE -> "Coverage is acceptable but should be observed against monthly demand.";
            case LOW -> "Healthy coverage and low immediate replenishment pressure.";
        };

        return new ComponentForecast(round(daysToStockout), round(probability), stockRisk, narrative);
    }

    public AnalyticsOverviewResponse buildOverview(List<EngineeringComponent> components) {
        int totalComponents = components.size();
        int totalUnits = components.stream().mapToInt(EngineeringComponent::getQuantity).sum();

        List<ComponentForecastView> forecastViews = components.stream()
                .map(component -> new ComponentForecastView(component, forecast(component)))
                .toList();

        long lowStockComponents = forecastViews.stream()
                .filter(view -> view.forecast().stockRisk() == StockRisk.HIGH || view.forecast().stockRisk() == StockRisk.CRITICAL)
                .count();

        long predictedShortagesThisMonth = forecastViews.stream()
                .filter(view -> view.forecast().predictedDaysToStockout() <= 30)
                .count();

        double averageAvailability = round(forecastViews.stream()
                .mapToDouble(view -> view.forecast().availabilityProbability())
                .average()
                .orElse(0));

        Map<String, Long> domainDistribution = components.stream()
                .collect(Collectors.groupingBy(component -> component.getDiscipline().name(), LinkedHashMap::new, Collectors.counting()));

        Map<String, Long> regionDistribution = components.stream()
                .collect(Collectors.groupingBy(EngineeringComponent::getRegion, LinkedHashMap::new, Collectors.counting()));

        List<AnalyticsOverviewResponse.RiskItem> atRiskComponents = forecastViews.stream()
                .sorted(Comparator
                        .comparingInt((ComponentForecastView view) -> view.forecast().stockRisk().getSeverity()).reversed()
                        .thenComparingDouble(view -> view.forecast().predictedDaysToStockout()))
                .limit(5)
                .map(view -> new AnalyticsOverviewResponse.RiskItem(
                        view.component().getId(),
                        view.component().getComponentCode(),
                        view.component().getName(),
                        view.component().getDiscipline().name(),
                        view.forecast().predictedDaysToStockout(),
                        view.forecast().availabilityProbability(),
                        view.forecast().stockRisk()))
                .toList();

        List<String> insights = buildInsights(totalComponents, totalUnits, lowStockComponents, predictedShortagesThisMonth,
                averageAvailability, domainDistribution, regionDistribution);

        return new AnalyticsOverviewResponse(
                totalComponents,
                totalUnits,
                lowStockComponents,
                predictedShortagesThisMonth,
                averageAvailability,
                domainDistribution,
                regionDistribution,
                atRiskComponents,
                insights);
    }

    private List<String> buildInsights(int totalComponents,
                                       int totalUnits,
                                       long lowStockComponents,
                                       long predictedShortagesThisMonth,
                                       double averageAvailability,
                                       Map<String, Long> domainDistribution,
                                       Map<String, Long> regionDistribution) {
        String dominantDomain = domainDistribution.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(entry -> entry.getKey() + " leads the catalog with " + entry.getValue() + " managed components")
                .orElse("No engineering domain distribution available yet");

        String dominantRegion = regionDistribution.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(entry -> entry.getKey() + " is the most represented sourcing region")
                .orElse("No sourcing region data available yet");

        return List.of(
                totalComponents + " active component profiles represent " + totalUnits + " stocked units across global engineering inventories.",
                lowStockComponents + " components are currently flagged as high-risk or critical, while " + predictedShortagesThisMonth + " may deplete within 30 days.",
                "Average predicted availability confidence is " + averageAvailability + "%.",
                dominantDomain + ".",
                dominantRegion + "."
        );
    }

    private StockRisk resolveRisk(EngineeringComponent component, double daysToStockout) {
        if (component.getQuantity() <= Math.max(1, component.getMinimumStockLevel() / 2) || daysToStockout <= component.getLeadTimeDays()) {
            return StockRisk.CRITICAL;
        }
        if (component.getQuantity() <= component.getMinimumStockLevel() || daysToStockout <= component.getLeadTimeDays() + 30) {
            return StockRisk.HIGH;
        }
        if (daysToStockout <= 90) {
            return StockRisk.MODERATE;
        }
        return StockRisk.LOW;
    }

    private double sigmoid(double value) {
        return 1.0 / (1.0 + Math.exp(-value));
    }

    private double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private record ComponentForecastView(EngineeringComponent component, ComponentForecast forecast) {
    }

    public record ComponentForecast(
            double predictedDaysToStockout,
            double availabilityProbability,
            StockRisk stockRisk,
            String narrative
    ) {
    }
}
