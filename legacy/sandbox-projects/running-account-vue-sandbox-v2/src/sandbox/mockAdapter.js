import sandboxState from "./state";

function ok(data) {
  return {
    code: 200,
    success: true,
    data
  };
}

function response(config, data) {
  return Promise.resolve({
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config
  });
}

function normalizeMethod(method) {
  return (method || "get").toLowerCase();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function filterDetails(params) {
  let list = clone(sandboxState.details);
  if (params.projectId) {
    list = list.filter(item => item.project.id === Number(params.projectId));
  }
  if (params.accountId) {
    list = list.filter(item => item.account.id === Number(params.accountId));
  }
  if (params.departmentId) {
    list = list.filter(item => item.department.id === Number(params.departmentId));
  }
  if (params.categoryId) {
    list = list.filter(item => item.category.id === Number(params.categoryId));
  }
  if (params.digest) {
    const keyword = String(params.digest).replaceAll("%", "");
    list = list.filter(item => item.digest.includes(keyword));
  }
  return list;
}

function nextDetailId() {
  return Math.max(...sandboxState.details.map(item => item.id)) + 1;
}

function nextDetailCount() {
  const counts = sandboxState.details
    .map(item => Number(item.count) || 0);
  return Math.max(0, ...counts) + 1;
}

export function sandboxAdapter(config) {
  const method = normalizeMethod(config.method);
  const url = String(config.url || "");
  const params = config.params || {};
  const data = typeof config.data === "string" ? JSON.parse(config.data) : (config.data || {});

  if (method === "post" && url === "rbac/user/login") {
    return response(config, ok(sandboxState.currentUser));
  }

  if (method === "delete" && url === "rbac/user/logout") {
    return response(config, ok(true));
  }

  if (method === "get" && url === "option/all") {
    return response(config, ok(clone(sandboxState.options)));
  }

  if (method === "get" && url === "detail") {
    const list = filterDetails(params);
    return response(config, ok({ list, total: list.length }));
  }

  if (method === "get" && /^detail\/\d+$/.test(url)) {
    const id = Number(url.split("/")[1]);
    const detail = clone(sandboxState.details.find(item => item.id === id));
    return response(config, ok(detail));
  }

  if (method === "post" && url === "detail") {
    const newDetail = {
      id: nextDetailId(),
      count: Number(data.count) || nextDetailCount(),
      hasPicture: false,
      pictures: [],
      reimbursement: false,
      balance: 99999,
      ...clone(data)
    };
    sandboxState.details.unshift(newDetail);
    return response(config, ok(newDetail.id));
  }

  if (method === "put" && url === "detail") {
    const index = sandboxState.details.findIndex(item => item.id === data.id);
    if (index >= 0) {
      sandboxState.details.splice(index, 1, { ...sandboxState.details[index], ...clone(data) });
    }
    return response(config, ok(true));
  }

  if (method === "delete" && url === "detail") {
    sandboxState.details = sandboxState.details.filter(item => item.id !== data.id);
    return response(config, ok(true));
  }

  if (method === "get" && /^detail\/picture\/\d+$/.test(url)) {
    const id = Number(url.split("/")[2]);
    const detail = sandboxState.details.find(item => item.id === id);
    const pictures = (detail?.pictures || []).map((item, index) => ({
      id: item.id || index + 1,
      uri: item.url
    }));
    return response(config, ok(pictures));
  }

  if (method === "delete" && /^detail\/picture\/\d+$/.test(url)) {
    return response(config, ok(true));
  }

  if (method === "post" && url === "excel/expenseClaimForm") {
    return response(config, ok("mock-form-001"));
  }

  return response(config, ok({}));
}
