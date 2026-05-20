package com.importpotato.baro;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
		"spring.ai.openai.api-key=test-api-key",
		"spring.datasource.url=jdbc:h2:mem:testdb",
		"spring.datasource.username=sa",
		"spring.datasource.password="
})
class BaroApplicationTests {

	@Test
	void contextLoads() {
	}

}
