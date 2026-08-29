package com.arena.compoundmanagement.dto;

import java.util.List;

public record PgbnnPreviewResponse(
        List<DomainProbability> disciplineProbabilities,
        String bestDiscipline,
        double neuralConfidencePercent,
        double ensembleAgreementPercent,
        double priorDays,
        double posteriorDays,
        double sigmaDays,
        double lowerDays,
        double upperDays,
        double agreementPercent,
        List<String> graphSignals
) {
    public record DomainProbability(String domain, double probabilityPercent) {
    }
}
