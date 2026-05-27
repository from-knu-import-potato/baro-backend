package com.importpotato.baro.auth.controller;

import com.importpotato.baro.auth.dto.KakaoLoginResult;
import com.importpotato.baro.auth.dto.KakaoLoginResponse;
import com.importpotato.baro.auth.service.KakaoAuthService;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Tag(name = "Auth", description = "인증 및 로그인 API")
public class KakaoAuthController {

    private final KakaoAuthService kakaoAuthService;

    @Operation(
            summary = "카카오 로그인 시작",
            description = "프론트에서 카카오 로그인을 시작할 때 호출합니다. 응답은 302 Found이며, 브라우저가 Location 헤더의 카카오 로그인 페이지로 이동합니다."
    )
    @ApiResponses({
            @ApiResponse(
                    responseCode = "302",
                    description = "카카오 OAuth 인가 페이지로 리다이렉트",
                    headers = @Header(
                            name = "Location",
                            description = "카카오 OAuth 인가 페이지 URL",
                            schema = @Schema(
                                    type = "string",
                                    format = "uri",
                                    example = "https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=test-rest-api-key&redirect_uri=http://localhost:8080/api/v1/auth/kakao/callback&state=state-token"
                            )
                    ),
                    content = @Content
            ),
            @ApiResponse(
                    responseCode = "503",
                    description = "카카오 OAuth 설정 누락",
                    content = @Content(schema = @Schema(implementation = ProblemDetail.class))
            )
    })
    @GetMapping("/kakao/login")
    public ResponseEntity<Void> requestKakaoLogin(
            @Parameter(description = "로그인 완료 후 프론트에서 검증하거나 복귀 처리에 사용할 상태 값", example = "state-token")
            @RequestParam(required = false) String state
    ) {
        URI kakaoAuthorizeUri = kakaoAuthService.createAuthorizationRedirectUri(state);

        return ResponseEntity.status(HttpStatus.FOUND)
                .location(kakaoAuthorizeUri)
                .build();
    }

    @Hidden
    @GetMapping("/kakao/callback")
    public ResponseEntity<KakaoLoginResponse> handleKakaoCallback(
            @RequestParam String code
    ) {
        KakaoLoginResult loginResult = kakaoAuthService.loginWithAuthorizationCode(code);
        HttpStatus status = loginResult.registered() ? HttpStatus.CREATED : HttpStatus.OK;

        return ResponseEntity.status(status)
                .body(loginResult.response());
    }
}
