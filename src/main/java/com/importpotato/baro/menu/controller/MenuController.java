package com.importpotato.baro.menu.controller;

import com.importpotato.baro.menu.dto.MenuCreateRequest;
import com.importpotato.baro.menu.dto.MenuListResponse;
import com.importpotato.baro.menu.dto.MenuResponse;
import com.importpotato.baro.menu.dto.MenuUpdateRequest;
import com.importpotato.baro.menu.service.MenuService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stores/{storeId}/menus")
@RequiredArgsConstructor
public class MenuController {

    private final MenuService menuService;

    @GetMapping
    public ResponseEntity<MenuListResponse> getMenus(
            @PathVariable Long storeId
    ) {
        MenuListResponse response = menuService.getMenus(storeId);

        return ResponseEntity.ok(response);
    }

    @PostMapping
    public ResponseEntity<MenuResponse> createMenu(
            @PathVariable Long storeId,
            @Valid @RequestBody MenuCreateRequest request
    ) {
        MenuResponse response = menuService.createMenu(storeId, request);

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(response);
    }

    @PatchMapping("/{menuId}")
    public ResponseEntity<MenuResponse> updateMenu(
            @PathVariable Long storeId,
            @PathVariable Long menuId,
            @Valid @RequestBody MenuUpdateRequest request
    ) {
        MenuResponse response = menuService.updateMenu(storeId, menuId, request);

        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{menuId}")
    public ResponseEntity<Void> deleteMenu(
            @PathVariable Long storeId,
            @PathVariable Long menuId
    ) {
        menuService.deleteMenu(storeId, menuId);

        return ResponseEntity.noContent().build();
    }
}
