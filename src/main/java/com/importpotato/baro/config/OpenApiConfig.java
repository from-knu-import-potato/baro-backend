package com.importpotato.baro.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Paths;
import io.swagger.v3.oas.models.servers.Server;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class OpenApiConfig {

    private static final String API_BASE_PATH = "/api/v1";

    @Bean
    public OpenAPI openAPI() {
        return new OpenAPI()
                .servers(List.of(new Server()
                        .url(API_BASE_PATH)
                        .description("API v1")));
    }

    @Bean
    public OpenApiCustomizer apiV1PathCustomizer() {
        return openApi -> {
            Paths paths = openApi.getPaths();
            if (paths == null || paths.isEmpty()) {
                return;
            }

            Paths baseUrlRelativePaths = new Paths();
            paths.forEach((path, pathItem) -> {
                if (path.startsWith(API_BASE_PATH + "/")) {
                    baseUrlRelativePaths.addPathItem(path.substring(API_BASE_PATH.length()), pathItem);
                    return;
                }
                baseUrlRelativePaths.addPathItem(path, pathItem);
            });
            openApi.setPaths(baseUrlRelativePaths);
        };
    }
}
