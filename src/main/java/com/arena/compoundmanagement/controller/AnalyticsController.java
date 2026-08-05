package com.arena.compoundmanagement.controller;

import com.arena.compoundmanagement.dto.AnalyticsOverviewResponse;
import com.arena.compoundmanagement.service.AnalyticsService;
import com.arena.compoundmanagement.service.ComponentService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final ComponentService componentService;
    private final AnalyticsService analyticsService;

    public AnalyticsController(ComponentService componentService, AnalyticsService analyticsService) {
        this.componentService = componentService;
        this.analyticsService = analyticsService;
    }

    @GetMapping("/overview")
    public AnalyticsOverviewResponse overview() {
        return analyticsService.buildOverview(componentService.findAll());
    }
}
