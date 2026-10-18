const KEY = "mkbs_demo_user";

export function getDemoUser() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setDemoUser(user) {
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function clearDemoUser() {
  localStorage.removeItem(KEY);
}
