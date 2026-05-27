"""Backend tracing helpers for V1 Business Map generation."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class JavaMethod:
    class_name: str
    method_name: str
    file_path: str
    method_signature: str
    line_number_hint: int
    body: str
    method_text: str
    annotations: list[str] = field(default_factory=list)


@dataclass
class ControllerEndpoint:
    class_name: str
    file_path: str
    base_path: str
    http_method: str
    route_path: str
    method_name: str
    method_signature: str
    line_number_hint: int
    body: str
    method_text: str
    field_types: dict[str, str] = field(default_factory=dict)


@dataclass
class ServiceClass:
    class_name: str
    file_path: str
    methods: dict[str, JavaMethod] = field(default_factory=dict)
    field_types: dict[str, str] = field(default_factory=dict)


@dataclass
class BackendTraceResult:
    controller: ControllerEndpoint | None = None
    service_methods: list[JavaMethod] = field(default_factory=list)
    unknown_reason: str | None = None
    deep_logic_reason: str | None = None


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def _normalize_path(path: str) -> str:
    path = path.strip()
    if not path:
        return "/"
    if not path.startswith("/"):
        path = "/" + path
    path = re.sub(r"\$\{[^}]+\}", "{var}", path)
    path = re.sub(r"\{[^}]+\}", "{var}", path)
    path = re.sub(r"/+", "/", path)
    return path.rstrip("/") or "/"


def _join_paths(base_path: str, endpoint_path: str) -> str:
    base = _normalize_path(base_path or "/")
    endpoint = endpoint_path.strip().strip('"').strip("'")
    if not endpoint:
        return base
    endpoint = _normalize_path(endpoint)
    if base == "/":
        return endpoint
    if endpoint == "/":
        return base
    return _normalize_path(base + "/" + endpoint.lstrip("/"))


def _find_java_root(backend_root: Path) -> Path | None:
    candidates = [
        backend_root / "src" / "main" / "java",
        backend_root / "server" / "src" / "main" / "java",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    if backend_root.name == "java" and backend_root.exists():
        return backend_root
    return None


def _extract_class_name(source: str, fallback: str) -> str:
    match = re.search(r"\bclass\s+(\w+)", source)
    return match.group(1) if match else fallback


def _extract_field_types(source: str) -> dict[str, str]:
    field_types: dict[str, str] = {}
    pattern = re.compile(
        r"(?:@Autowired\s+)?private\s+([A-Z]\w+)\s+([a-zA-Z_]\w*)\s*;",
        re.S,
    )
    for field_type, field_name in pattern.findall(source):
        field_types[field_name] = field_type
    return field_types


def _extract_methods(source: str, class_name: str, file_path: str) -> dict[str, JavaMethod]:
    methods: dict[str, JavaMethod] = {}
    pattern = re.compile(
        r"((?:\s*@[\w()\"/{}.,=\s-]+\n)*)\s*"
        r"((?:public|private|protected)\s+[^{;=]+\s+(\w+)\s*\([^)]*\)\s*(?:throws [^{]+)?)\s*\{",
        re.M,
    )
    for match in pattern.finditer(source):
        annotation_block = match.group(1) or ""
        signature = " ".join(match.group(2).split())
        method_name = match.group(3)
        body_start = match.end() - 1
        depth = 0
        body_end = body_start
        for index in range(body_start, len(source)):
            char = source[index]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    body_end = index
                    break
        annotations = [
            line.strip()
            for line in annotation_block.splitlines()
            if line.strip().startswith("@")
        ]
        methods[method_name] = JavaMethod(
            class_name=class_name,
            method_name=method_name,
            file_path=file_path,
            method_signature=signature,
            line_number_hint=source[: match.start()].count("\n") + 1,
            body=source[body_start + 1 : body_end],
            method_text=source[match.start() : body_end + 1],
            annotations=annotations,
        )
    return methods


def read_java_method(
    file_path: str,
    class_name: str,
    method_name: str,
    method_signature: str = "",
) -> JavaMethod | None:
    """Read one Java method by stable semantic locator instead of fixed line number."""
    source_path = Path(file_path).expanduser()
    if not source_path.exists():
        return None
    source = _read_text(source_path)
    effective_class_name = _extract_class_name(source, source_path.stem)
    if effective_class_name != class_name:
        return None
    methods = _extract_methods(source, effective_class_name, source_path.as_posix())
    method = methods.get(method_name)
    if method is None:
        return None
    if method_signature and method.method_signature != method_signature:
        return None
    return method


def _extract_base_request_mapping(source: str) -> str:
    match = re.search(r'@RequestMapping\(\s*["\']([^"\']*)["\']\s*\)', source)
    return match.group(1) if match else "/"


def _extract_controller_endpoints(controller_path: Path) -> list[ControllerEndpoint]:
    source = _read_text(controller_path)
    class_name = _extract_class_name(source, controller_path.stem)
    base_path = _extract_base_request_mapping(source)
    field_types = _extract_field_types(source)
    endpoints: list[ControllerEndpoint] = []
    methods = _extract_methods(source, class_name, controller_path.as_posix())
    mapping_pattern = re.compile(
        r"@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)"
        r"\(\s*([^\)]*)\s*\)"
    )
    for method in methods.values():
        for annotation in method.annotations:
            match = mapping_pattern.search(annotation)
            if not match:
                continue
            mapping_name = match.group(1)
            raw_arg = match.group(2).strip()
            endpoint_path = ""
            if raw_arg:
                literal = re.search(r'["\']([^"\']*)["\']', raw_arg)
                endpoint_path = literal.group(1) if literal else ""
            endpoints.append(
                ControllerEndpoint(
                    class_name=class_name,
                    file_path=controller_path.as_posix(),
                    base_path=base_path,
                    http_method=mapping_name.replace("Mapping", "").upper(),
                    route_path=_join_paths(base_path, endpoint_path),
                    method_name=method.method_name,
                    method_signature=method.method_signature,
                    line_number_hint=method.line_number_hint,
                    body=method.body,
                    method_text=method.method_text,
                    field_types=field_types,
                )
            )
    return endpoints


def _index_service_classes(java_root: Path) -> dict[str, ServiceClass]:
    services: dict[str, ServiceClass] = {}
    for service_path in sorted(java_root.rglob("*Service.java")):
        source = _read_text(service_path)
        class_name = _extract_class_name(source, service_path.stem)
        services[class_name] = ServiceClass(
            class_name=class_name,
            file_path=service_path.as_posix(),
            methods=_extract_methods(source, class_name, service_path.as_posix()),
            field_types=_extract_field_types(source),
        )
    return services


def _looks_deep_logic(body: str) -> str | None:
    reasons: list[str] = []
    if body.count("if (") >= 3 or body.count("if(") >= 3:
        reasons.append("涉及较多条件分支")
    if body.count("for (") + body.count("while (") >= 2:
        reasons.append("包含多层循环处理")
    external_calls = re.findall(r"\b\w+(?:Service|Dao|Mapper)\.\w+\(", body)
    if len(external_calls) >= 5:
        reasons.append("跨组件调用较多")
    if body.count("\n") >= 80:
        reasons.append("方法体较长")
    if reasons:
        return "，".join(reasons)
    return None


def _trace_service_methods(
    endpoint: ControllerEndpoint,
    services: dict[str, ServiceClass],
    max_depth: int,
) -> tuple[list[JavaMethod], str | None, str | None]:
    traced: list[JavaMethod] = []
    unknown_reason: str | None = None
    deep_logic_reason: str | None = None
    service_calls = re.findall(r"(\w+Service)\.(\w+)\(", endpoint.body)
    if not service_calls:
        unknown_reason = "Controller 方法中未识别到直接的 Service 调用"
        return traced, unknown_reason, deep_logic_reason

    for field_name, method_name in service_calls:
        service_type = endpoint.field_types.get(field_name)
        if not service_type:
            unknown_reason = f"未能确认字段 {field_name} 对应的 Service 类型"
            continue
        service_class = services.get(service_type)
        if not service_class:
            unknown_reason = f"未能在后端定位到 {service_type}.java"
            continue
        service_method = service_class.methods.get(method_name)
        if not service_method:
            unknown_reason = f"未能在 {service_type} 中定位到方法 {method_name}"
            continue
        traced.append(service_method)

        nested_calls = re.findall(r"\b\w+Service\.\w+\(", service_method.body)
        if len(nested_calls) >= max_depth:
            deep_logic_reason = (
                f"{endpoint.method_name} 涉及较深的 Service 级联调用，"
                "V1 仅保留一跳定位，建议后续 Agent 继续实地勘察"
            )
        elif not deep_logic_reason:
            deep_logic_reason = _looks_deep_logic(service_method.body)
            if deep_logic_reason:
                deep_logic_reason = (
                    f"{endpoint.method_name} 的后端逻辑较复杂（{deep_logic_reason}），"
                    "V1 未继续深入总结"
                )
    return traced, unknown_reason, deep_logic_reason


def trace_backend_flow(
    backend_root: str,
    http_method: str,
    api_path: str,
    *,
    max_service_depth: int = 3,
) -> BackendTraceResult:
    root = Path(backend_root).expanduser()
    java_root = _find_java_root(root)
    if java_root is None:
        return BackendTraceResult(
            unknown_reason=f"backend_path 下未找到标准 SpringBoot java 目录: {backend_root}"
        )

    target_method = http_method.upper().strip()
    target_path = _normalize_path(api_path)
    matched_endpoint: ControllerEndpoint | None = None
    for controller_path in sorted(java_root.rglob("*Controller.java")):
        for endpoint in _extract_controller_endpoints(controller_path):
            if endpoint.http_method == target_method and endpoint.route_path == target_path:
                matched_endpoint = endpoint
                break
        if matched_endpoint:
            break

    if matched_endpoint is None:
        return BackendTraceResult(
            unknown_reason=f"未能在后端根据 {target_method} {target_path} 命中 Controller 方法"
        )

    services = _index_service_classes(java_root)
    service_methods, unknown_reason, deep_logic_reason = _trace_service_methods(
        matched_endpoint,
        services,
        max_service_depth,
    )
    return BackendTraceResult(
        controller=matched_endpoint,
        service_methods=service_methods,
        unknown_reason=unknown_reason,
        deep_logic_reason=deep_logic_reason,
    )
