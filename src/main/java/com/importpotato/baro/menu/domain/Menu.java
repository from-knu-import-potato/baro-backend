package com.importpotato.baro.menu.domain;

import com.importpotato.baro.store.domain.Store;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "menus")
public class Menu {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "menu_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "image_url", length = 255)
    private String imageUrl;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false)
    private Integer price;

    @Column(nullable = false)
    private Boolean signature;

    @Column(name = "updated", nullable = false)
    private LocalDateTime updated;

    protected Menu() {
    }

    private Menu(Store store, String name, String imageUrl, String description, Integer price, Boolean signature) {
        this.store = store;
        this.name = name;
        this.imageUrl = normalizeBlank(imageUrl);
        this.description = normalizeBlank(description);
        this.price = price;
        this.signature = signature;
        this.updated = LocalDateTime.now();
    }

    public static Menu create(Store store, String name, String imageUrl, String description, Integer price, Boolean signature) {
        return new Menu(store, name, imageUrl, description, price, signature);
    }

    public void update(String name, String imageUrl, String description, Integer price, Boolean signature) {
        if (name != null) {
            this.name = name;
        }
        if (imageUrl != null) {
            this.imageUrl = normalizeBlank(imageUrl);
        }
        if (description != null) {
            this.description = normalizeBlank(description);
        }
        if (price != null) {
            this.price = price;
        }
        if (signature != null) {
            this.signature = signature;
        }
        this.updated = LocalDateTime.now();
    }

    private static String normalizeBlank(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value;
    }

    public Long getId() {
        return id;
    }

    public Store getStore() {
        return store;
    }

    public String getName() {
        return name;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public String getDescription() {
        return description;
    }

    public Integer getPrice() {
        return price;
    }

    public Boolean getSignature() {
        return signature;
    }

    public LocalDateTime getUpdated() {
        return updated;
    }
}
