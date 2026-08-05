package com.arena.compoundmanagement.service;

import com.arena.compoundmanagement.model.EngineeringComponent;
import com.arena.compoundmanagement.model.EngineeringDomain;
import com.arena.compoundmanagement.model.StockRisk;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class SearchService {

    private static final Pattern NON_ALPHANUMERIC = Pattern.compile("[^a-z0-9+ ]");
    private static final Pattern UNDER_PATTERN = Pattern.compile("(?:under|below|less than)\\s+(\\d+)");
    private static final Pattern OVER_PATTERN = Pattern.compile("(?:over|above|more than)\\s+(\\d+)");

    private static final Map<String, String> TOKEN_SYNONYMS = Map.ofEntries(
            Map.entry("motors", "motor"),
            Map.entry("controllers", "controller"),
            Map.entry("transceivers", "transceiver"),
            Map.entry("bearings", "bearing"),
            Map.entry("sensors", "sensor"),
            Map.entry("modules", "module"),
            Map.entry("mechanic", "mechanical"),
            Map.entry("electronics", "electronic"),
            Map.entry("electricals", "electrical")
    );

    private final AnalyticsService analyticsService;

    public SearchService(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    public SearchOutcome search(String query, List<EngineeringComponent> components) {
        SearchIntent intent = parse(query);
        List<SearchMatch> matches = components.stream()
                .map(component -> scoreComponent(component, intent))
                .filter(match -> match.score() > 0)
                .sorted((left, right) -> Double.compare(right.score(), left.score()))
                .toList();

        return new SearchOutcome(buildIntentSummary(intent), matches);
    }

    private SearchMatch scoreComponent(EngineeringComponent component, SearchIntent intent) {
        if (intent.originalQuery().isBlank()) {
            return new SearchMatch(component, 1, List.of("Browsing the full catalog"));
        }

        String searchableText = String.join(" ",
                safe(component.getComponentCode()),
                safe(component.getName()),
                safe(component.getCategory()),
                safe(component.getSubCategory()),
                safe(component.getManufacturer()),
                safe(component.getSpecifications()),
                safe(component.getRegion()),
                component.getDiscipline().name()
        );
        String normalizedText = normalize(searchableText);
        Set<String> searchableTokens = tokenize(normalizedText);
        List<String> reasons = new ArrayList<>();
        double score = 0;

        if (normalize(component.getName()).contains(intent.normalizedQuery()) || normalize(component.getComponentCode()).contains(intent.normalizedQuery())) {
            score += 30;
            reasons.add("Direct name/code match");
        }

        long overlaps = intent.tokens().stream().filter(searchableTokens::contains).count();
        if (overlaps > 0) {
            score += overlaps * 6;
            reasons.add(overlaps + " query terms matched component metadata");
        }

        if (intent.discipline() != null && intent.discipline() == component.getDiscipline()) {
            score += 18;
            reasons.add("Matched engineering discipline: " + component.getDiscipline().name());
        }

        if (intent.region() != null && component.getRegion().toLowerCase(Locale.ROOT).contains(intent.region().toLowerCase(Locale.ROOT))) {
            score += 15;
            reasons.add("Matched sourcing region: " + component.getRegion());
        }

        if (intent.minimumQuantity() != null && component.getQuantity() >= intent.minimumQuantity()) {
            score += 8;
            reasons.add("Meets quantity threshold above " + intent.minimumQuantity());
        } else if (intent.minimumQuantity() != null) {
            score -= 8;
        }

        if (intent.maximumQuantity() != null && component.getQuantity() <= intent.maximumQuantity()) {
            score += 8;
            reasons.add("Fits quantity threshold under " + intent.maximumQuantity());
        } else if (intent.maximumQuantity() != null) {
            score -= 8;
        }

        AnalyticsService.ComponentForecast forecast = analyticsService.forecast(component);
        if (intent.lowStockFocus() && (forecast.stockRisk() == StockRisk.HIGH || forecast.stockRisk() == StockRisk.CRITICAL)) {
            score += 20;
            reasons.add("Low-stock focus satisfied");
        } else if (intent.lowStockFocus()) {
            score -= 5;
        }

        if (intent.healthyStockFocus() && forecast.stockRisk() == StockRisk.LOW) {
            score += 20;
            reasons.add("Healthy availability profile matched");
        } else if (intent.healthyStockFocus() && forecast.stockRisk() == StockRisk.HIGH) {
            score -= 3;
        }

        if (intent.availabilityFocus()) {
            score += forecast.availabilityProbability() / 8.0;
            reasons.add("Availability confidence applied to ranking");
        }

        if (intent.normalizedQuery().contains("recommend") || intent.normalizedQuery().contains("similar")) {
            score += forecast.availabilityProbability() / 10.0;
        }

        if (reasons.isEmpty() && score > 0) {
            reasons.add("Broad semantic match across specifications");
        }

        return new SearchMatch(component, round(score), reasons.stream().distinct().collect(Collectors.toList()));
    }

    private SearchIntent parse(String query) {
        String original = query == null ? "" : query.trim();
        String normalized = normalize(original);
        Set<String> tokens = tokenize(normalized).stream()
                .map(token -> TOKEN_SYNONYMS.getOrDefault(token, token))
                .collect(Collectors.toCollection(HashSet::new));

        EngineeringDomain discipline = null;
        if (tokens.contains("eee") || tokens.contains("electrical") || tokens.contains("power")) {
            discipline = EngineeringDomain.EEE;
        }
        if (tokens.contains("ece") || tokens.contains("communication") || tokens.contains("embedded")) {
            discipline = EngineeringDomain.ECE;
        }
        if (tokens.contains("mechanical") || tokens.contains("bearing") || tokens.contains("gear") || tokens.contains("shaft")) {
            discipline = EngineeringDomain.MECHANICAL;
        }

        Map<String, Collection<String>> regions = new LinkedHashMap<>();
        regions.put("Asia-Pacific", List.of("asia pacific", "asia", "india", "china", "japan", "korea", "taiwan", "apac"));
        regions.put("Europe", List.of("europe", "germany", "france", "uk"));
        regions.put("South America", List.of("south america", "brazil"));
        regions.put("North America", List.of("north america", "usa", "canada", "america"));
        regions.put("Middle East", List.of("middle east", "uae", "saudi"));
        regions.put("Africa", List.of("africa"));
        regions.put("Global", List.of("global", "worldwide"));

        String region = regions.entrySet().stream()
                .filter(entry -> entry.getValue().stream().anyMatch(normalized::contains))
                .map(Map.Entry::getKey)
                .findFirst()
                .orElse(null);

        boolean lowStockFocus = normalized.contains("low stock") || normalized.contains("reorder")
                || normalized.contains("critical") || normalized.contains("urgent");
        boolean healthyStockFocus = normalized.contains("high availability") || normalized.contains("healthy stock")
                || normalized.contains("in stock") || normalized.contains("available");
        boolean availabilityFocus = healthyStockFocus || normalized.contains("availability") || normalized.contains("forecast");

        Integer minimumQuantity = extractNumericThreshold(OVER_PATTERN, normalized);
        Integer maximumQuantity = extractNumericThreshold(UNDER_PATTERN, normalized);

        return new SearchIntent(original, normalized, tokens, discipline, region, lowStockFocus, healthyStockFocus,
                availabilityFocus, minimumQuantity, maximumQuantity);
    }

    private Integer extractNumericThreshold(Pattern pattern, String normalizedQuery) {
        Matcher matcher = pattern.matcher(normalizedQuery);
        if (matcher.find()) {
            return Integer.parseInt(matcher.group(1));
        }
        return null;
    }

    private String buildIntentSummary(SearchIntent intent) {
        List<String> parts = new ArrayList<>();
        if (intent.discipline() != null) {
            parts.add("discipline=" + intent.discipline().name());
        }
        if (intent.region() != null) {
            parts.add("region=" + intent.region());
        }
        if (intent.lowStockFocus()) {
            parts.add("risk-focus=low-stock");
        }
        if (intent.healthyStockFocus()) {
            parts.add("risk-focus=healthy-availability");
        }
        if (intent.minimumQuantity() != null) {
            parts.add("quantity>=" + intent.minimumQuantity());
        }
        if (intent.maximumQuantity() != null) {
            parts.add("quantity<=" + intent.maximumQuantity());
        }
        if (parts.isEmpty()) {
            return "Intent parser found a general semantic lookup across names, categories, specs, and sourcing regions.";
        }
        return "Intent parser applied filters: " + String.join(", ", parts) + ".";
    }

    private Set<String> tokenize(String normalizedText) {
        if (normalizedText == null || normalizedText.isBlank()) {
            return Set.of();
        }

        Set<String> tokens = new HashSet<>();
        for (String token : normalizedText.split(" ")) {
            if (token.length() >= 2) {
                tokens.add(token);
            }
        }
        return tokens;
    }

    private String safe(String value) {
        return value == null ? "" : value;
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

    public record SearchOutcome(String interpretedIntent, List<SearchMatch> matches) {
    }

    public record SearchMatch(EngineeringComponent component, double score, List<String> reasons) {
    }

    private record SearchIntent(
            String originalQuery,
            String normalizedQuery,
            Set<String> tokens,
            EngineeringDomain discipline,
            String region,
            boolean lowStockFocus,
            boolean healthyStockFocus,
            boolean availabilityFocus,
            Integer minimumQuantity,
            Integer maximumQuantity
    ) {
    }
}
