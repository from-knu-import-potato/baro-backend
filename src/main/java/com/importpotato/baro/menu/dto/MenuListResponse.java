package com.importpotato.baro.menu.dto;

import java.util.List;

public record MenuListResponse(
        Long storeId,
        int count,
        List<MenuResponse> menus
) {

    public static MenuListResponse of(Long storeId, List<MenuResponse> menus) {
        return new MenuListResponse(storeId, menus.size(), menus);
    }
}
