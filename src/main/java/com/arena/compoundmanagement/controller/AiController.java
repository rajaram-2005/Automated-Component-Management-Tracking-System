package com.arena.compoundmanagement.controller;

import com.arena.compoundmanagement.dto.ClassificationRequest;
import com.arena.compoundmanagement.dto.ClassificationResponse;
import com.arena.compoundmanagement.service.ClassificationService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final ClassificationService classificationService;

    public AiController(ClassificationService classificationService) {
        this.classificationService = classificationService;
    }

    @PostMapping("/classify")
    public ClassificationResponse classify(@RequestBody ClassificationRequest request) {
        ClassificationService.ClassificationOutcome outcome = classificationService.classify(
                request.name(), request.specifications(), request.categoryHint());

        String summary = "Predicted " + outcome.discipline().getDisplayName() + " / " + outcome.category()
                + " with " + outcome.confidence() + "% confidence.";

        return new ClassificationResponse(
                outcome.discipline(),
                outcome.category(),
                outcome.confidence(),
                outcome.matchedSignals(),
                summary);
    }
}
