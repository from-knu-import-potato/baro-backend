package com.importpotato.baro.store.exception;

public class StoreNotFoundException extends RuntimeException {

    public StoreNotFoundException(Long storeId) {
        super("Store not found. storeId=" + storeId);
    }
}
