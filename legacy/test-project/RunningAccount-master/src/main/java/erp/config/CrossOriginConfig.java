package erp.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.util.StringUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 跨域配置，仅在 dev 环境启用。
 * <p>
 * CorsFilter 注册为最高优先级，尽量先于 Shiro 处理预检 OPTIONS。
 *
 * @author Yhaobo
 * @since 2020/10/3
 */
@SpringBootConfiguration
@Profile("dev")
public class CrossOriginConfig {

    /**
     * 逗号分隔的允许源，需与前端实际访问地址一致（含端口）。
     * 默认覆盖常见本地开发端口：8081（原 Vue 默认）、8084、8000（工作台等）。
     */
    @Value("${erp.cors.allowed-origins:http://localhost:8081,http://localhost:8084,http://127.0.0.1:8081,http://127.0.0.1:8084,http://localhost:8000,http://127.0.0.1:8000}")
    private String allowedOrigins;

    @Bean
    public FilterRegistrationBean<CorsFilter> corsFilter() {
        final UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        final CorsConfiguration config = new CorsConfiguration();
        config.setAllowCredentials(true);
        for (String origin : parseOrigins(allowedOrigins)) {
            config.addAllowedOrigin(origin);
        }
        config.addAllowedHeader("*");
        config.addAllowedMethod("*");
        config.setMaxAge(3600L);
        source.registerCorsConfiguration("/**", config);

        FilterRegistrationBean<CorsFilter> bean = new FilterRegistrationBean<>(new CorsFilter(source));
        bean.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return bean;
    }

    private static List<String> parseOrigins(String raw) {
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .collect(Collectors.toList());
    }
}
