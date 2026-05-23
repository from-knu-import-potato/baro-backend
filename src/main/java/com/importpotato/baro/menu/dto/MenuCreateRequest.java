package com.importpotato.baro.menu.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record MenuCreateRequest(
        @NotBlank(message = "name is required")
        @Size(max = 100, message = "name must not exceed 100 characters")
        String name,

        @Size(max = 255, message = "imageUrl must not exceed 255 characters")
        @Pattern(
                regexp = "^(|https?://.+)$",
                message = "imageUrl must be empty or start with http:// or https://"
        )
        String imageUrl,

        @Size(max = 1000, message = "description must not exceed 1000 characters")
        String description,

        @NotNull(message = "price is required")
        @Min(value = 0, message = "price must be greater than or equal to 0")
        @Max(value = 100000000, message = "price must not exceed 100000000")
        Integer price,

        @NotNull(message = "signature is required")
        Boolean signature
) {
}
