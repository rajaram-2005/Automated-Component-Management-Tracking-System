package com.arena.compoundmanagement.service;

import com.arena.compoundmanagement.model.EngineeringComponent;
import com.arena.compoundmanagement.model.StockRisk;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class RecommendationService {

    private static final Pattern NON_ALPHANUMERIC = Pattern.compile("[^a-z0-9+ ]");

    private final AnalyticsService analyticsService;
    private final SearchService searchService;

    public RecommendationService(AnalyticsService analyticsService, SearchService searchService) {
        this.analyticsService = analyticsService;
        this.searchService = searchService;
    }

    public RecommendationOutcome recommendForComponent(EngineeringComponent baseComponent, List<EngineeringComponent> allComponents) {
        Map<String, List<String>> complementaryCategories = complementaryCategories();

        List<RecommendationMatch> matches = allComponents.stream()
                .filter(component -> !component.getId().equals(baseComponent.getId()))
                .map(candidate -> scoreCandidate(baseComponent, candidate, complementaryCategories))
                .filter(match -> match.score() > 0)
                .sorted((left, right) -> Double.compare(right.score(), left.score()))
                .limit(5)
                .toList();

        String summary = "Recommendations for " + baseComponent.getName()
                + " combine domain similarity, complementary-category affinity, and predicted stock resilience.";
        return new RecommendationOutcome(summary, matches);
    }

    public RecommendationOutcome recommendForQuery(String query, List<EngineeringComponent> allComponents) {
        SearchService.SearchOutcome searchOutcome = searchService.search(query, allComponents);
        if (searchOutcome.matches().isEmpty()) {
            return new RecommendationOutcome(
                    "No strong semantic match was found for the query. Try adding a discipline, category, or region.",
                    List.of());
        }

        EngineeringComponent anchor = searchOutcome.matches().get(0).component();
        RecommendationOutcome anchoredRecommendations = recommendForComponent(anchor, allComponents);
        String summary = "AI recommendations grounded the natural-language query in " + anchor.getName()
                + " and expanded it with complementary, high-availability components.";
        return new RecommendationOutcome(summary, anchoredRecommendations.matches());
    }

    private RecommendationMatch scoreCandidate(EngineeringComponent base,
                                               EngineeringComponent candidate,
                                               Map<String, List<String>> complementaryCategories) {
        List<String> reasons = new ArrayList<>();
        double score = 0;

        if (candidate.getDiscipline() == base.getDiscipline()) {
            score += 20;
            reasons.add("Same engineering discipline");
        }

        if (candidate.getCategory().equalsIgnoreCase(base.getCategory())) {
            score += 18;
            reasons.add("Same category family");
        }

        List<String> complementary = complementaryCategories.getOrDefault(base.getCategory(), List.of());
        if (complementary.stream().anyMatch(category -> category.equalsIgnoreCase(candidate.getCategory()))) {
            score += 16;
            reasons.add("Complementary category to the selected component");
        }

        if (candidate.getRegion().equalsIgnoreCase(base.getRegion())) {
            score += 8;
            reasons.add("Compatible sourcing region");
        }

        long sharedSignals = tokenOverlap(base.getName() + " " + base.getSpecifications(),
                candidate.getName() + " " + candidate.getSpecifications());
        if (sharedSignals > 0) {
            score += Math.min(sharedSignals * 3, 18);
            reasons.add(sharedSignals + " shared specification signals");
        }

        AnalyticsService.ComponentForecast forecast = analyticsService.forecast(candidate);
        score += forecast.availabilityProbability() / 6.0;
        reasons.add("Availability confidence contributes to ranking");

        if (forecast.stockRisk() == StockRisk.LOW) {
            score += 10;
            reasons.add("Low replenishment risk");
        }

        return new RecommendationMatch(candidate, round(score), reasons.stream().distinct().collect(Collectors.toList()));
    }

    private Map<String, List<String>> complementaryCategories() {
        Map<String, List<String>> map = new HashMap<>();
        map.put("Embedded & IoT Controllers", List.of("Sensors & Instrumentation", "Communication Modules", "Power Electronics"));
        map.put("Communication Modules", List.of("Embedded & IoT Controllers", "Sensors & Instrumentation"));
        map.put("Power Electronics", List.of("Industrial Control", "Drives & Motion Control", "Sensors & Instrumentation"));
        map.put("Drives & Motion Control", List.of("Power Electronics", "Sensors & Instrumentation", "Mechanical Power Transmission"));
        map.put("Bearings & Motion", List.of("Mechanical Power Transmission", "Fasteners & Fabrication"));
        map.put("Mechanical Power Transmission", List.of("Bearings & Motion", "Fluid Power & Actuation"));
        map.put("Fluid Power & Actuation", List.of("Mechanical Power Transmission", "Fasteners & Fabrication"));
        return map;
    }

    private long tokenOverlap(String left, String right) {
        Set<String> leftTokens = tokenize(normalize(left));
        Set<String> rightTokens = tokenize(normalize(right));
        leftTokens.retainAll(rightTokens);
        return leftTokens.stream().filter(token -> token.length() > 2).count();
    }

    private Set<String> tokenize(String normalizedText) {
        if (normalizedText.isBlank()) {
            return new HashSet<>();
        }
        Set<String> tokens = new HashSet<>();
        for (String token : normalizedText.split(" ")) {
            if (token.length() >= 2) {
                tokens.add(token);
            }
        }
        return tokens;
    }

    private String normalize(String value) {
        return NON_ALPHANUMERIC.matcher(value == null ? "" : value.toLowerCase(Locale.ROOT))
                .replaceAll(" ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    public record RecommendationOutcome(String summary, List<RecommendationMatch> matches) {
    }

    public record RecommendationMatch(EngineeringComponent component, double score, List<String> reasons) {
    }
}
