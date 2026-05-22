package com.importpotato.baro.store.dto;

import com.importpotato.baro.store.domain.Store;

import java.time.LocalTime;

public record StoreBusinessHoursResponse(
        LocalTime monOpen,
        LocalTime monClose,
        Boolean monClosed,

        LocalTime tueOpen,
        LocalTime tueClose,
        Boolean tueClosed,

        LocalTime wedOpen,
        LocalTime wedClose,
        Boolean wedClosed,

        LocalTime thuOpen,
        LocalTime thuClose,
        Boolean thuClosed,

        LocalTime friOpen,
        LocalTime friClose,
        Boolean friClosed,

        LocalTime satOpen,
        LocalTime satClose,
        Boolean satClosed,

        LocalTime sunOpen,
        LocalTime sunClose,
        Boolean sunClosed
) {

    public static StoreBusinessHoursResponse from(Store store) {
        return new StoreBusinessHoursResponse(
                store.getMonOpen(),
                store.getMonClose(),
                store.getMonClosed(),
                store.getTueOpen(),
                store.getTueClose(),
                store.getTueClosed(),
                store.getWedOpen(),
                store.getWedClose(),
                store.getWedClosed(),
                store.getThuOpen(),
                store.getThuClose(),
                store.getThuClosed(),
                store.getFriOpen(),
                store.getFriClose(),
                store.getFriClosed(),
                store.getSatOpen(),
                store.getSatClose(),
                store.getSatClosed(),
                store.getSunOpen(),
                store.getSunClose(),
                store.getSunClosed()
        );
    }
}
