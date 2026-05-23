package com.importpotato.baro.menu.exception;

public class MenuNotFoundException extends RuntimeException {

    public MenuNotFoundException(Long storeId, Long menuId) {
        super("Menu not found. storeId=" + storeId + ", menuId=" + menuId);
    }
}
