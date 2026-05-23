package com.importpotato.baro.menu.service;

import com.importpotato.baro.menu.domain.Menu;
import com.importpotato.baro.menu.dto.MenuCreateRequest;
import com.importpotato.baro.menu.dto.MenuListResponse;
import com.importpotato.baro.menu.dto.MenuResponse;
import com.importpotato.baro.menu.dto.MenuUpdateRequest;
import com.importpotato.baro.menu.exception.InvalidMenuRequestException;
import com.importpotato.baro.menu.exception.MenuNotFoundException;
import com.importpotato.baro.menu.repository.MenuRepository;
import com.importpotato.baro.store.domain.Store;
import com.importpotato.baro.store.exception.StoreNotFoundException;
import com.importpotato.baro.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class MenuService {

    private final MenuRepository menuRepository;
    private final StoreRepository storeRepository;

    @Transactional(readOnly = true)
    public MenuListResponse getMenus(Long storeId) {
        Store store = findOwnedStore(storeId);

        return MenuListResponse.of(
                store.getId(),
                menuRepository.findAllByStoreIdOrderByIdAsc(store.getId())
                        .stream()
                        .map(MenuResponse::from)
                        .toList()
        );
    }

    @Transactional
    public MenuResponse createMenu(Long storeId, MenuCreateRequest request) {
        Store store = findOwnedStore(storeId);

        Menu menu = Menu.create(
                store,
                request.name(),
                request.imageUrl(),
                request.description(),
                request.price(),
                request.signature()
        );
        Menu savedMenu = menuRepository.save(menu);

        return MenuResponse.from(savedMenu);
    }

    @Transactional
    public MenuResponse updateMenu(Long storeId, Long menuId, MenuUpdateRequest request) {
        findOwnedStore(storeId);
        validateUpdateRequest(request);

        Menu menu = findMenuInStore(storeId, menuId);
        validateNameIfPresent(request.name());
        menu.update(
                request.name(),
                request.imageUrl(),
                request.description(),
                request.price(),
                request.signature()
        );

        return MenuResponse.from(menu);
    }

    @Transactional
    public void deleteMenu(Long storeId, Long menuId) {
        findOwnedStore(storeId);
        Menu menu = findMenuInStore(storeId, menuId);

        menuRepository.delete(menu);
    }

    private Store findOwnedStore(Long storeId) {
        Long userId = getCurrentUserId();
        return storeRepository.findByIdAndUserId(storeId, userId)
                .orElseThrow(() -> new StoreNotFoundException(storeId));
    }

    private Menu findMenuInStore(Long storeId, Long menuId) {
        return menuRepository.findByIdAndStoreId(menuId, storeId)
                .orElseThrow(() -> new MenuNotFoundException(storeId, menuId));
    }

    private void validateUpdateRequest(MenuUpdateRequest request) {
        if (request.name() == null
                && request.imageUrl() == null
                && request.description() == null
                && request.price() == null
                && request.signature() == null) {
            throw new InvalidMenuRequestException("At least one field is required to update menu");
        }
    }

    private void validateNameIfPresent(String name) {
        if (name != null && name.isBlank()) {
            throw new InvalidMenuRequestException("name must not be blank");
        }
    }

    private Long getCurrentUserId() {
        return 1L;
    }
}
