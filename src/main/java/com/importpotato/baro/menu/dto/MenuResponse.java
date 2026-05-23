package com.importpotato.baro.menu.dto;

import com.importpotato.baro.menu.domain.Menu;

import java.time.LocalDateTime;

public record MenuResponse(
        Long menuId,
        Long storeId,
        String name,
        String imageUrl,
        String description,
        Integer price,
        Boolean signature,
        LocalDateTime updated
) {

    public static MenuResponse from(Menu menu) {
        return new MenuResponse(
                menu.getId(),
                menu.getStore().getId(),
                menu.getName(),
                menu.getImageUrl(),
                menu.getDescription(),
                menu.getPrice(),
                menu.getSignature(),
                menu.getUpdated()
        );
    }
}
