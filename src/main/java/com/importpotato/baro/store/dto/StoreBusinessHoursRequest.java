package com.importpotato.baro.store.dto;

import jakarta.validation.constraints.NotNull;

import java.time.LocalTime;

public record StoreBusinessHoursRequest(
        LocalTime monOpen,
        LocalTime monClose,
        @NotNull(message = "monClosed is required")
        Boolean monClosed,

        LocalTime tueOpen,
        LocalTime tueClose,
        @NotNull(message = "tueClosed is required")
        Boolean tueClosed,

        LocalTime wedOpen,
        LocalTime wedClose,
        @NotNull(message = "wedClosed is required")
        Boolean wedClosed,

        LocalTime thuOpen,
        LocalTime thuClose,
        @NotNull(message = "thuClosed is required")
        Boolean thuClosed,

        LocalTime friOpen,
        LocalTime friClose,
        @NotNull(message = "friClosed is required")
        Boolean friClosed,

        LocalTime satOpen,
        LocalTime satClose,
        @NotNull(message = "satClosed is required")
        Boolean satClosed,

        LocalTime sunOpen,
        LocalTime sunClose,
        @NotNull(message = "sunClosed is required")
        Boolean sunClosed
) {
}
